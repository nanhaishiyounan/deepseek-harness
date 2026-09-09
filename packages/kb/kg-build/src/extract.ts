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
import { UNCLASSIFIED_TYPE } from './mappers.ts'
import type { DroppedRelation, ExtractedEntity, ExtractedRelation, ExtractionOutcome } from './types.ts'

/** The registry face extraction reads: every registered type and relation. */
export interface OntologyView {
  readonly entityTypes: readonly { readonly id: string; readonly label: string }[]
  readonly relations: readonly {
    readonly id: string
    readonly label: string
    readonly constraints: readonly { readonly domain: string; readonly range: string }[]
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
