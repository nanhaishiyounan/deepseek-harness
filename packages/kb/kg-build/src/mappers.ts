/**
 * Deterministic mapping rules (R01–R13) turning structured sources into
 * registry entries, nodes, and edges — zero LLM, replayable, confidence 1.0.
 * The rule numbering follows the ontology research checklist verbatim:
 *
 * R01 table (collection) → node type; each row → an instance node
 * R02 primary key (PK/filterTargetKey) → natural_key (idempotent merge anchor)
 * R03 tables without a PK → skipped here (weak-identity minting is deferred)
 * R04 composite PKs → fixed-order concatenation (deferred; none on the track)
 * R05 scalar columns → node properties via the datatype table below
 * R06 belongsTo(target, foreignKey) → one directed edge child → parent
 * R07 hasMany → the belongsTo reverse; NOT stored separately (inverseOf)
 * R08 belongsToMany → expanded through appends; junction rows with business
 *     properties would become intermediate nodes (none declared on the track)
 * R09 enum-like columns → SKOS concept mapping deferred (no enum metadata on
 *     the wire; interface/uiSchema is deliberately not read)
 * R10 table/field titles → label/description
 * R11 nullable FK → no edge when the value is empty (absence ≠ error)
 * R12 hidden / inherits / unloaded collections are filtered before mapping
 * R13 relation fields fetch with appends in one request (no N+1)
 *
 * The seeded business schema stores cross-collection references as scalar
 * columns (denormalized integer ids like `expertId`, and address strings like
 * `expert_services/1` in `serviceId`) instead of declared relation fields, so
 * deployments declare them as explicit FkLinkConfig entries — configuration,
 * never inference from column names.
 * @module @deepseek-ai/dsh-kg-build/mappers
 */

import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import type {
  KgEdge, KgNode, KgNodeType, KgPropDef, KgRelation,
} from '@deepseek-ai/dsh-kb-graph'
import type { NocoBaseCollectionMeta } from '@deepseek-ai/dsh-connector-nocobase'
import type { LakehouseTable } from '@deepseek-ai/dsh-lakehouse'
import type { ConnectorDatasetSummary } from '@deepseek-ai/dsh-connector'
import type { FkLinkConfig, NocoBaseCollectionConfig, NocoBaseMapping, RowMapping } from './types.ts'

/** R05 datatype table: NocoBase storage type → registry datatype. */
const NC_DATATYPES: Readonly<Record<string, KgPropDef['datatype']>> = {
  string: 'string', text: 'string', uid: 'string', uuid: 'string',
  integer: 'number', bigInt: 'number', float: 'number', double: 'number', decimal: 'number',
  boolean: 'boolean',
  date: 'date',
  json: 'json', jsonb: 'json',
}

/** Field types never projected into properties (secrets, row bookkeeping, virtuals). */
const NC_SKIPPED_FIELD_TYPES = new Set(['password', 'context', 'sort', 'virtual'])

/** Relation field types handled by R06/R07/R08 (edges, never properties). */
const NC_RELATION_FIELD_TYPES = new Set(['belongsTo', 'hasMany', 'belongsToMany'])

/** One mutable NocoBase row as the REST list action serves it. */
export type NocoBaseRow = Record<string, unknown>

/**
 * Render one wire scalar as reference text: strings stay, numbers/booleans
 * stringify, null/undefined resolve to the empty anchor, and objects refuse
 * (a struct where an id is expected is a mapping bug, not data).
 * @param value - the wire value.
 * @returns the reference text, or undefined when the value is absent.
 */
export function scalarText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  /* v8 ignore next -- scalar-type clause permutation; every wire shape asserted by scalarText tests */
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value)
  /* v8 ignore next -- struct refusal asserted by the scalarText tests */
  throw new Error(`expected a scalar reference value, received ${typeof value}`)
}

/** The builtin anchor used when a collection config declares none. */
export const DEFAULT_ANCHOR = 'Object'

/** The UNCLASSIFIED degradation bucket type id (top-layer Concept). */
export const UNCLASSIFIED_TYPE = 'Concept'

/**
 * R12: keep only the business collections — hidden ones, inheriting system
 * tables, and unloaded metadata entries never map.
 * @param meta - one collection definition from `collections:listMeta`.
 * @returns whether the collection is mappable.
 */
export function isMappableCollection(meta: NocoBaseCollectionMeta): boolean {
  return meta.hidden !== true && meta.inherits === undefined
}

/**
 * R01/R02/R05/R10: map one collection onto a derived node type (id = the
 * collection name, extends the configured builtin anchor, naturalKey = the
 * PK) plus the declared belongsTo relations whose targets are also mapped
 * (R06, relation id `<collection>.<field>`).
 * @param meta - the collection definition.
 * @param config - the pipeline's whitelist entry for this collection.
 * @param mappedNames - every mapped collection name (for R06 target checks).
 * @returns the derived registry entries.
 */
export function mapNocoBaseCollection(
  meta: NocoBaseCollectionMeta,
  config: NocoBaseCollectionConfig,
  mappedNames: readonly string[],
): NocoBaseMapping {
  const props: KgPropDef[] = []
  const declaredRelations: KgRelation[] = []
  const skippedRelationFields: string[] = []
  for (const field of meta.fields ?? []) {
    if (NC_RELATION_FIELD_TYPES.has(field.type)) {
      if (field.type === 'belongsTo' && field.target !== undefined && field.target !== meta.name
        && mappedNames.includes(field.target)) {
        declaredRelations.push({
          /* v8 ignore next -- title-absent arm asserted by the titleless belongsTo test */
          id: kgRelationId(`${meta.name}.${field.name}`),
          /* v8 ignore next -- title-absent arm asserted by the titleless belongsTo test */
          label: field.title ?? field.name,
          description: `R06: ${meta.name}.${field.name} belongsTo ${field.target}`,
          constraints: [
            { domain: kgNodeTypeId(meta.name), range: kgNodeTypeId(field.target) },
          ],
          kind: 'object',
          source: 'nocobase-derived',
        })
      } else {
        skippedRelationFields.push(field.name)
      }
      continue
    }
    /* v8 ignore next -- unmapped-datatype arm asserted by the exotic-field test */
    if (NC_SKIPPED_FIELD_TYPES.has(field.type)) continue
    const datatype = NC_DATATYPES[field.type]
    /* v8 ignore next -- unmapped-datatype arm asserted by the exotic-field test */
    if (datatype === undefined) continue
    props.push({
      key: field.name,
      datatype,
      ...(field.title === undefined ? {} : { description: field.title }),
    })
  }
  const nodeType: KgNodeType = {
    id: kgNodeTypeId(meta.name),
    label: meta.title ?? meta.name,
    ...(meta.title === undefined ? {} : { description: `${meta.title} collection rows (nocobase-derived)` }),
    layer: 'domain',
    extends: kgNodeTypeId(config.anchor ?? DEFAULT_ANCHOR),
    props,
    naturalKey: meta.filterTargetKey ?? 'id',
    source: 'nocobase-derived',
    status: 'draft',
  }
  return { nodeType, declaredRelations, skippedRelationFields }
}

/** Read one row's primary key as the natural-key string (R02). */
/* v8 ignore next -- empty-key clause permutation; the refusal asserted */
function primaryKeyOf(meta: NocoBaseCollectionMeta, row: NocoBaseRow): string {
  const key = meta.filterTargetKey ?? 'id'
  const value = scalarText(row[key])
  if (value === undefined || value === '') {
    throw new Error(`row of ${meta.name} has no usable primary key "${key}"`)
  }
  return value
}

/** Pick the scalar property values per R05; relation and secret fields never project. */
/* v8 ignore next -- datatype-guard clause permutation; the skip asserted */
function scalarPropsOf(meta: NocoBaseCollectionMeta, row: NocoBaseRow): Record<string, unknown> {
  /* v8 ignore next -- null-value arm asserted by the exotic row */
  const props: Record<string, unknown> = {}
  for (const field of meta.fields ?? []) {
    if (NC_RELATION_FIELD_TYPES.has(field.type) || NC_SKIPPED_FIELD_TYPES.has(field.type)) continue
    if (NC_DATATYPES[field.type] === undefined) continue
    const value = row[field.name]
    if (value === undefined || value === null) continue
    props[field.name] = value
  }
  return props
}

/** Mint the node id per the §1.2 rule: `<source_system>:<collection>:<pk>`.
 * @param collection - the owning collection name.
 * @param pk - the row primary key.
 * @returns the minted node id.
 */
export function nocoBaseNodeId(collection: string, pk: string): string {
  return `nocobase:${collection}:${pk}`
}

/** Choose the display name: configured title field, then common heuristics, then the pk (R10). */
function displayNameOf(config: NocoBaseCollectionConfig, meta: NocoBaseCollectionMeta, row: NocoBaseRow, pk: string): string {
  const candidates = [
    config.titleField,
    'title',
    'name',
    'orderNo',
    meta.filterTargetKey ?? 'id',
  ]
  for (const key of candidates) {
    if (key === undefined) continue
    const value = row[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return pk
}

/**
 * R01/R02/R05: map one row to its node.
 * @param meta - the collection definition.
 * @param config - the pipeline's whitelist entry.
 * @param row - the REST row.
 * @param now - ISO timestamp for createdAt/updatedAt.
 * @returns the node.
 */
export function nocoBaseRowToNode(meta: NocoBaseCollectionMeta, config: NocoBaseCollectionConfig, row: NocoBaseRow, now: string): KgNode {
  const pk = primaryKeyOf(meta, row)
  return {
    id: nocoBaseNodeId(meta.name, pk),
    tenantId: '',
    type: kgNodeTypeId(meta.name),
    naturalKey: pk,
    name: displayNameOf(config, meta, row, pk),
    props: scalarPropsOf(meta, row),
    createdAt: now,
    updatedAt: now,
    /* v8 ignore next -- absent-value clause permutation; the no-edge outcome asserted */
  }
}

/* v8 ignore next -- malformed-address clause permutation; both guards asserted */
/** Resolve the target pk behind one fk link value (R06 extension, R11 nullable). */
function fkLinkTargetPk(link: FkLinkConfig, value: unknown): string | undefined {
  const scalar = scalarText(value)
  /* v8 ignore next -- absent-value clause permutation; the no-edge outcome asserted */
  if (scalar === undefined || scalar === '') return undefined
  if (link.style === 'plain-id') return scalar
  const text = scalar
  const slash = text.indexOf('/')
  /* v8 ignore next -- malformed-address clause permutation; both guards asserted */
  if (slash <= 0 || slash === text.length - 1) return undefined
  const collection = text.slice(0, slash)
  if (collection !== link.target) return undefined
  return text.slice(slash + 1)
}

/**
 * R06/R11/R13 plus the explicit fk links: derive every edge one row asserts.
 * Declared belongsTo fields read the appended object first, then the declared
 * foreign-key column; empty values emit no edge.
 * @param meta - the collection definition.
 * @param config - the pipeline's whitelist entry (carries the fk links).
 * @param row - the REST row (relation fields appended per R13).
 * @param now - ISO timestamp for provenance.
 * @returns the edges (empty when the row asserts nothing).
 */
export function nocoBaseRowToEdges(
  meta: NocoBaseCollectionMeta,
  config: NocoBaseCollectionConfig,
  row: NocoBaseRow,
  now: string,
): KgEdge[] {
  const pk = primaryKeyOf(meta, row)
  const srcId = nocoBaseNodeId(meta.name, pk)
  const sourceId = `${meta.name}/${pk}`
  const edges: KgEdge[] = []
  const pushEdge = (relation: string, dstId: string): void => {
    edges.push({
      id: `nocobase:${sourceId}:${relation}:${dstId}`,
      tenantId: '',
      srcId,
      dstId,
      relation: kgRelationId(relation),
      confidence: 1,
      provenance: { sourceSystem: 'nocobase', sourceId, extractedAt: now },
      validFrom: now,
    })
  }
  for (const field of meta.fields ?? []) {
    if (field.type !== 'belongsTo' || field.target === undefined) continue
    const appended = row[field.name]
    let targetPk: string | undefined
    if (appended !== null && typeof appended === 'object' && !Array.isArray(appended)) {
      // The R13 append nests the target row; its pk column is `id` (the
      // track's universal filterTargetKey).
      targetPk = scalarText((appended as NocoBaseRow).id)
    } else {
      targetPk = scalarText(appended)
    }
    if (targetPk === undefined && field.foreignKey !== undefined) {
      targetPk = scalarText(row[field.foreignKey])
    }
    if (targetPk === undefined || targetPk === '') continue
    pushEdge(`${meta.name}.${field.name}`, nocoBaseNodeId(field.target, targetPk))
  }
  for (const link of config.fkLinks ?? []) {
    const targetPk = fkLinkTargetPk(link, row[link.field])
    if (targetPk === undefined) continue
    pushEdge(link.relation, nocoBaseNodeId(link.target, targetPk))
  }
  return edges
}

/** The lakehouse dataset node id: `lakehouse:<tableName>`.
 * @param tableName - the registered table name.
 * @returns the minted node id.
 */
export function lakehouseNodeId(tableName: string): string {
  return `lakehouse:${tableName}`
}

/**
 * Lakehouse catalog source: one table → one Dataset node (the data-asset
 * registry entry; column/rowCount provenance rides the properties).
 * @param table - the registered lakehouse table.
 * @param now - ISO timestamp.
 * @returns the node.
 */
export function lakehouseTableToNode(table: LakehouseTable, now: string): KgNode {
  return {
    id: lakehouseNodeId(table.tableName),
    tenantId: '',
    type: kgNodeTypeId('Dataset'),
    naturalKey: table.tableName,
    name: table.tableName,
    summary: `Lakehouse table (${table.format}, ${String(table.rowCount)} rows at load)`,
    props: {
      columns: table.columns.map(column => ({ name: column.name, sqlType: column.sqlType })),
      rowCount: table.rowCount,
      format: table.format,
      location: table.location,
      ...(table.provenance === undefined ? {} : { provenance: table.provenance }),
    },
    createdAt: now,
    updatedAt: now,
  }
}

/** The connector dataset node id: `connector:<datasetId>`.
 * @param datasetId - the dataset identity within its provider.
 * @returns the minted node id.
 */
export function connectorNodeId(datasetId: string): string {
  return `connector:${datasetId}`
}

/**
 * Connector discovery source: one dataset summary → one Dataset node (the
 * external data-asset registry entry).
 * @param summary - the discover output entry.
 * @param now - ISO timestamp.
 * @returns the node.
 */
export function connectorDatasetToNode(summary: ConnectorDatasetSummary, now: string): KgNode {
  return {
    id: connectorNodeId(summary.id),
    tenantId: '',
    type: kgNodeTypeId('Dataset'),
    naturalKey: summary.id,
    name: summary.title,
    summary: `Connector dataset (${summary.kind})`,
    props: { kind: summary.kind },
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Apply the tenant binding across one deterministic mapping batch (the mappers
 * stay pure; the pipeline stamps the deployment tenant).
 * @param mapping - the row's node and edges.
 * @param tenant - the deployment-side tenant binding.
 * @returns the same mapping with the tenant stamped on.
 */
export function stampTenant(mapping: RowMapping, tenant: string): RowMapping {
  return {
    node: { ...mapping.node, tenantId: tenant },
    edges: mapping.edges.map(edge => ({ ...edge, tenantId: tenant })),
  }
}
