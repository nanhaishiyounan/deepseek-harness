/**
 * Closed-set LLM extraction over corpus chunks: a pedantic prompt listing the
 * registry's entity types and relation directions, a decode-side validation
 * chain (JSON parse → structural shape → closed set + direction), one
 * feedback retry, and the UNCLASSIFIED degradation bucket. Nothing outside
 * the registry reaches the graph: unknown entity types degrade to `Concept`
 * nodes with the claim recorded, unknown or direction-violating relations are
 * dropped with reasons — the defense against model hallucination.
 * @module @deepseek-ai/dsh-kg-build/extract
 */

import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import type { KgPropDef } from '@deepseek-ai/dsh-kb-graph'
import { UNCLASSIFIED_TYPE } from './mappers.ts'
import type { DroppedRelation, ExtractedEntity, ExtractedRelation, ExtractionOutcome } from './types.ts'

/** The registry face extraction reads: every registered type and relation. */
export interface OntologyView {
  readonly entityTypes: readonly {
    readonly id: string
    readonly label: string
    /** Property definitions (the SHACL gate's shapes source); absent on legacy snapshots. */
    readonly props?: readonly KgPropDef[]
  }[]
  readonly relations: readonly {
    readonly id: string
    readonly label: string
    readonly description?: string
    readonly constraints: readonly {
      readonly domain: string
      readonly range: string
      readonly cardinality?: { readonly min?: number; readonly max?: number }
    }[]
  }[]
}

/** The LLM face extraction calls (the pipeline adapts ctx.llm to this). */
export interface ExtractionLlm {
  /**
   * One completion over a system + user pair.
   * @param system - the instruction prompt.
   * @param user - the chunk text.
   * @returns the model's raw answer text.
   */
  complete(system: string, user: string): Promise<string>
}

/** One raw entity as the prompt asks for it. */
interface RawEntity {
  readonly type?: unknown
  readonly name?: unknown
  readonly props?: unknown
  readonly evidence?: unknown
}

/** One raw relation as the prompt asks for it. */
interface RawRelation {
  readonly subject?: unknown
  readonly predicate?: unknown
  readonly object?: unknown
  readonly confidence?: unknown
  readonly evidence?: unknown
}

/**
 * Build the closed-set extraction prompt (pedantic instruction + the ontology
 * vocabulary + the output JSON shape + one few-shot example).
 * @param view - the registry snapshot (all registered entries, draft included).
 * @returns the system prompt text.
 */
export function buildExtractionPrompt(view: OntologyView): string {
  const types = view.entityTypes.map(type => `- ${type.id}（${type.label}）`).join('\n')
  const relations = view.relations.map((relation) => {
    const directions = relation.constraints.length === 0
      ? '任意方向'
      : relation.constraints.map(pair => `${pair.domain}→${pair.range}`).join(' / ')
    return `- ${relation.id}（${relation.label}）：${directions}`
  }).join('\n')
  return [
    '你是实体关系抽取器，只能从给定的本体闭集中选择类型与谓词。绝对禁止发明闭集之外的类型或谓词。',
    '实体类型闭集：',
    types,
    '关系谓词闭集（主语类型→宾语类型）：',
    relations,
    '输出要求：只输出一个 JSON 对象，不要输出任何其他文字。结构如下：',
    '{"entities":[{"type":"<闭集实体类型>","name":"<实体名>","props":{可选属性},"evidence":"<原文片段>"}],',
    '"relations":[{"subject":"<主语实体名>","predicate":"<闭集谓词>","object":"<宾语实体名>","confidence":0.0到1.0,"evidence":"<原文片段>"}]}',
    '示例输入：宏发食品生产的酱油含有山梨酸钾。',
    '示例输出：{"entities":[{"type":"company","name":"宏发食品"},{"type":"product","name":"酱油"},{"type":"additive","name":"山梨酸钾"}],',
    '"relations":[{"subject":"宏发食品","predicate":"produces","object":"酱油","confidence":0.9},{"subject":"酱油","predicate":"contains","object":"山梨酸钾","confidence":0.9}]}',
  ].join('\n')
}

/** Extract the outermost JSON object text from a model answer. */
function sliceJsonObject(text: string): string | undefined {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  return text.slice(start, end + 1)
}

/** Assert one raw entity's structural shape (level two of the chain). */
function isShapedEntity(entity: RawEntity): boolean {
  return typeof entity.type === 'string' && entity.type.length > 0
    && typeof entity.name === 'string' && entity.name.trim().length > 0
    && (entity.props === undefined || (typeof entity.props === 'object' && entity.props !== null && !Array.isArray(entity.props)))
}

/** Assert one raw relation's structural shape. */
function isShapedRelation(relation: RawRelation): boolean {
  return typeof relation.subject === 'string' && relation.subject.trim().length > 0
    && typeof relation.predicate === 'string' && relation.predicate.length > 0
    && typeof relation.object === 'string' && relation.object.trim().length > 0
    && (relation.confidence === undefined || (typeof relation.confidence === 'number' && relation.confidence >= 0 && relation.confidence <= 1))
}

/** Parse + shape-check the model output; a failure yields the retry reason. */
function parseShaped(text: string): { entities: RawEntity[]; relations: RawRelation[] } | { badJson: string } | { badShape: string } {
  const sliced = sliceJsonObject(text)
  if (sliced === undefined) return { badJson: 'answer contains no JSON object' }
  let parsed: unknown
  try {
    parsed = JSON.parse(sliced)
  } catch (error: unknown) {
    /* v8 ignore next -- JSON.parse throws SyntaxError only. */
    return { badJson: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}` }
  }
  // Braces-delimited JSON always parses to a non-null object; typeof is a
  // belt for exotic parser behavior, and v8 coverage ignores its dead arm.
  /* v8 ignore next -- braces input cannot parse to a non-object. */
  if (typeof parsed !== 'object') return { badShape: 'top level is not a JSON object' }
  const record = parsed as { entities?: unknown; relations?: unknown }
  if (record.entities !== undefined && !Array.isArray(record.entities)) return { badShape: '"entities" is not an array' }
  if (record.relations !== undefined && !Array.isArray(record.relations)) return { badShape: '"relations" is not an array' }
  const entities = (record.entities ?? []) as unknown[]
  const relations = (record.relations ?? []) as unknown[]
  for (const entity of entities) {
    if (typeof entity !== 'object' || entity === null || !isShapedEntity(entity)) {
      return { badShape: 'an entity entry misses type/name or has a malformed props object' }
    }
  }
  for (const relation of relations) {
    if (typeof relation !== 'object' || relation === null || !isShapedRelation(relation)) {
      return { badShape: 'a relation entry misses subject/predicate/object or confidence is out of [0,1]' }
    }
  }
  return { entities: entities as RawEntity[], relations: relations as RawRelation[] }
}

/** Look up one relation's allowed direction pairs. */
function constraintsOf(view: OntologyView, id: string): readonly { domain: string; range: string }[] | undefined {
  return view.relations.find(relation => relation.id === id)?.constraints
}

/**
 * Closed-set adjudication of one shaped extraction: entities with unknown
 * types degrade to the UNCLASSIFIED bucket; relations with unknown predicates
 * or direction violations drop with reasons.
 * @param shaped - the shaped raw output.
 * @param view - the registry snapshot.
 * @param typeOfEntity - resolved claimed types for direction checks (name → type id).
 * @returns the outcome pieces plus feedback when violations exist.
 */
function adjudicate(
  shaped: { entities: RawEntity[]; relations: RawRelation[] },
  view: OntologyView,
  typeOfEntity: Map<string, string>,
): { entities: ExtractedEntity[]; relations: ExtractedRelation[]; dropped: DroppedRelation[] } {
  const knownTypes = new Set(view.entityTypes.map(type => type.id))
  const entities: ExtractedEntity[] = []
  for (const rawEntity of shaped.entities as readonly RawEntity[]) {
    const entity: RawEntity = rawEntity
    const claimedType = entity.type as string
    const name = (entity.name as string).trim()
    const known = knownTypes.has(claimedType)
    // The UNCLASSIFIED bucket is the builtin top-layer Concept — always registered.
    const resolvedType = known ? claimedType : UNCLASSIFIED_TYPE
    entities.push({
      name,
      resolvedType: kgNodeTypeId(resolvedType),
      claimedType,
      // isShapedEntity guarantees props is an object when present.
      ...(entity.props === undefined ? {} : { props: entity.props as Record<string, unknown> }),
      ...(typeof entity.evidence === 'string' ? { evidence: entity.evidence } : {}),
      degraded: !known,
    })
    if (!typeOfEntity.has(name)) typeOfEntity.set(name, resolvedType)
  }
  const relations: ExtractedRelation[] = []
  const dropped: DroppedRelation[] = []
  for (const relation of shaped.relations) {
    const predicate = relation.predicate as string
    const subjectName = (relation.subject as string).trim()
    const objectName = (relation.object as string).trim()
    const constraints = constraintsOf(view, predicate)
    if (constraints === undefined) {
      const reason = `predicate "${predicate}" is not in the closed set`
      dropped.push({ predicate, subjectName, objectName, reason })
      continue
    }
    const srcType = typeOfEntity.get(subjectName)
    const dstType = typeOfEntity.get(objectName)
    if (srcType === undefined || dstType === undefined) {
      // Endpoints the model never declared as entities cannot be direction-checked.
      const reason = `relation "${predicate}" references an undeclared endpoint`
      dropped.push({ predicate, subjectName, objectName, reason })
      continue
    }
    const legal = constraints.length === 0 || constraints.some(pair => pair.domain === srcType && pair.range === dstType)
    if (!legal) {
      const reason = `relation "${predicate}" allows ${constraints.map(pair => `${pair.domain}→${pair.range}`).join(' / ')}, not ${srcType}→${dstType}`
      dropped.push({ predicate, subjectName, objectName, reason })
      continue
    }
    relations.push({
      subjectName,
      objectName,
      relation: kgRelationId(predicate),
      confidence: typeof relation.confidence === 'number' ? relation.confidence : 0.5,
      ...(typeof relation.evidence === 'string' ? { evidence: relation.evidence } : {}),
    })
  }
  return { entities, relations, dropped }
}

/**
 * Run the full extraction chain over one chunk: prompt the LLM, parse, shape,
 * closed-set adjudicate; on a parse/shape failure retry once with feedback.
 * @param llm - the LLM face.
 * @param view - the registry snapshot.
 * @param chunkText - the chunk handed to the model.
 * @param system - the prebuilt system prompt.
 * @returns the extraction outcome.
 */
export async function extractChunk(llm: ExtractionLlm, view: OntologyView, system: string, chunkText: string): Promise<ExtractionOutcome> {
  const first = await llm.complete(system, chunkText)
  const shapedFirst = parseShaped(first)
  if ('badJson' in shapedFirst || 'badShape' in shapedFirst) {
    const reason = 'badJson' in shapedFirst ? shapedFirst.badJson : shapedFirst.badShape
    const second = await llm.complete(`${system}\n\n上一次输出无效（${reason}）。严格只输出符合要求的 JSON 对象。`, chunkText)
    const shapedSecond = parseShaped(second)
    if ('badJson' in shapedSecond || 'badShape' in shapedSecond) {
      return { entities: [], relations: [], dropped: [], retried: true }
    }
    const typeOfEntity = new Map<string, string>()
    const pass = adjudicate(shapedSecond, view, typeOfEntity)
    return { entities: pass.entities, relations: pass.relations, dropped: pass.dropped, retried: true }
  }
  const typeOfEntity = new Map<string, string>()
  return { ...adjudicate(shapedFirst, view, typeOfEntity), retried: false }
}

/** The selectable extraction prompt protocols (the A/B gate's two arms). */
export type ExtractionProtocol = 'legacy' | 'instruct-kgc'

/** How many relations one instruct-kgc schema-dict batch carries (split_num). */
export const INSTRUCT_KGC_SPLIT_NUM = 4

/**
 * Build the Instruct-KGC JSON-protocol prompt: the schema-dict mode OneKE
 * validated — each relation entry becomes `label → 定义 + 头/尾实体类型说明`,
 * the instruction fixes the strict JSON answer shape, and unknown shapes
 * must return empty lists instead of inventions.
 * @param view - the registry snapshot.
 * @returns the system prompt text.
 */
export function buildInstructKgcPrompt(view: OntologyView): string {
  const types = new Map(view.entityTypes.map(type => [type.id, type]))
  const schemaDict: Record<string, string> = {}
  for (const relation of view.relations) {
    const pairText = relation.constraints.length === 0
      ? '头尾实体类型不限'
      : relation.constraints.map(pair => `${types.get(pair.domain)?.label ?? pair.domain}(${pair.domain})→${types.get(pair.range)?.label ?? pair.range}(${pair.range})`).join(' / ')
    const definition = relation.description ?? relation.label
    schemaDict[`${relation.id}（${relation.label}）`] = `${definition}。合法方向：${pairText}。`
  }
  const schemaLines = Object.entries(schemaDict).map(([key, value]) => `- ${key}: ${value}`).join('\n')
  return [
    '你是专门进行知识图谱三元组抽取的专家。请从 input 中抽取符合 schema 定义的实体与关系，不存在的关系类型返回空列表，不确定的实体不要发明。',
    '实体类型闭集：',
    ...view.entityTypes.map(type => `- ${type.id}（${type.label}）`),
    '关系 schema dict（关系 id（标签）: 定义与合法方向）：',
    schemaLines,
    '输出要求：只输出一个 JSON 对象，不要输出任何其他文字。结构如下：',
    '{"entities":[{"type":"<闭集实体类型>","name":"<实体名>","props":{可选属性},"evidence":"<原文片段>"}],',
    '"relations":[{"subject":"<主语实体名>","predicate":"<关系id>","object":"<宾语实体名>","confidence":0.0到1.0,"evidence":"<原文片段>"}]}',
    '硬约束：predicate 必须逐字使用上面关系 id 闭集；type 必须逐字使用实体类型闭集；一条关系抽不出就整个省略，不要输出占位。',
  ].join('\n')
}

/**
 * Split one registry snapshot into schema-dict batches (the split_num
 * discipline: small schema slices per call beat one giant schema the model
 * skips over). Grouping keeps relations sharing a domain together where the
 * order allows.
 * @param view - the full registry snapshot.
 * @param splitNum - relations per batch.
 * @returns the batches, in registry order.
 */
export function splitOntologyView(view: OntologyView, splitNum: number = INSTRUCT_KGC_SPLIT_NUM): readonly OntologyView[] {
  const batches: OntologyView[] = []
  for (let index = 0; index < view.relations.length; index += splitNum) {
    batches.push({ entityTypes: view.entityTypes, relations: view.relations.slice(index, index + splitNum) })
  }
  return batches.length > 0 ? batches : [{ entityTypes: view.entityTypes, relations: [] }]
}

/** Merge batch outcomes: dedupe entities by (name, resolved type), relations by (subject, predicate, object). */
function mergeOutcomes(parts: readonly ExtractionOutcome[]): ExtractionOutcome {
  const entityKeys = new Set<string>()
  const relationKeys = new Set<string>()
  const entities: ExtractedEntity[] = []
  const relations: ExtractedRelation[] = []
  const dropped: DroppedRelation[] = []
  let retried = false
  for (const part of parts) {
    if (part.retried) retried = true
    for (const entity of part.entities) {
      const key = `${String(entity.resolvedType)}:${entity.name}`
      if (entityKeys.has(key)) continue
      entityKeys.add(key)
      entities.push(entity)
    }
    for (const relation of part.relations) {
      const key = `${relation.subjectName}:${String(relation.relation)}:${relation.objectName}`
      if (relationKeys.has(key)) continue
      relationKeys.add(key)
      relations.push(relation)
    }
    dropped.push(...part.dropped)
  }
  return { entities, relations, dropped, retried }
}

/**
 * Run one chunk under a selectable protocol. `legacy` keeps the single-prompt
 * closed-set extraction (the A/B baseline); `instruct-kgc` runs the JSON
 * schema-dict protocol over split batches and merges the outcomes through
 * the same closed-set adjudication chain.
 * @param llm - the LLM face.
 * @param view - the registry snapshot.
 * @param chunkText - the chunk handed to the model.
 * @param protocol - which prompt protocol to run.
 * @returns the merged extraction outcome.
 */
export async function extractChunkProtocol(
  llm: ExtractionLlm,
  view: OntologyView,
  chunkText: string,
  protocol: ExtractionProtocol,
): Promise<ExtractionOutcome> {
  if (protocol === 'legacy') {
    return await extractChunk(llm, view, buildExtractionPrompt(view), chunkText)
  }
  const parts: ExtractionOutcome[] = []
  for (const batch of splitOntologyView(view)) {
    parts.push(await extractChunk(llm, batch, buildInstructKgcPrompt(batch), chunkText))
  }
  return mergeOutcomes(parts)
}

/**
 * Parse and shape one raw model answer with the decode-side chain (exposed
 * for the SHACL feedback loop, which re-adjudicates corrected answers).
 * @param text - the raw model output.
 * @returns the shaped parse result.
 */
export type ShapedExtraction = { entities: RawEntity[]; relations: RawRelation[] } | { badJson: string } | { badShape: string }

/**
 * Parse one legacy-protocol extraction answer into the shaped result.
 * @param text - the raw model output.
 * @returns the shaped parse result.
 */
export function parseExtractionAnswer(text: string): ShapedExtraction {
  return parseShaped(text)
}

/**
 * Adjudicate one pre-shaped answer against the registry (exposed for the
 * SHACL feedback loop).
 * @param shaped - the shaped raw output.
 * @param view - the registry snapshot.
 * @returns the outcome pieces.
 */
export function adjudicateShaped(
  shaped: { entities: RawEntity[]; relations: RawRelation[] },
  view: OntologyView,
): { entities: ExtractedEntity[]; relations: ExtractedRelation[]; dropped: DroppedRelation[] } {
  return adjudicate(shaped, view, new Map<string, string>())
}
