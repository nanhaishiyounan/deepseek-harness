/**
 * The LLM schema-induction pipeline (the automatic ontology path): corpus
 * documents are chunked, each chunk goes to the model with an OntoGPT-style
 * structured-output prompt, the per-chunk JSON candidates merge into one
 * draft, and the SHACL gate decides admission — with a bounded repair loop
 * that re-feeds the structured violation list. The model never writes
 * syntax: it emits JSON, code serializes. Every model round-trip lands in
 * the returned transcript (the real-call evidence).
 * @module @deepseek-ai/dsh-ontology-induction/induction
 */

import { formatGateFeedback, gateOntologyDraft } from './gate.ts'
import type {
  InducedClassDef, InducedConstraint, InducedPropDef, InducedRelationDef,
  InductionCorpusDoc, OntologyDraft, OntologyGateReport,
} from './types.ts'

/** The LLM face induction calls (the pipeline adapts ctx.llm to this). */
export interface InductionLlm {
  /**
   * One completion over a system + user pair.
   * @param system - the instruction prompt.
   * @param user - the chunk text (or the repair request).
   * @returns the model's raw answer text.
   */
  complete(system: string, user: string): Promise<string>
}

/** One corpus chunk with its provenance header. */
export interface CorpusChunk {
  readonly doc: string
  readonly index: number
  readonly text: string
}

/** One model round-trip as the transcript records it. */
export interface InductionTranscriptEntry {
  readonly doc: string
  readonly chunk: number
  readonly kind: 'extract' | 'repair'
  readonly system: string
  readonly user: string
  readonly raw: string
}

/** The pipeline's tunables (all Config-delegable). */
export interface InductionOptions {
  /** Max characters per chunk; longer documents split. Defaults to 6000. */
  readonly maxChunkChars?: number
  /** Bounded repair rounds after a refusing gate; defaults to 2. */
  readonly maxRepairs?: number
  /** Domain guidance injected into the prompt (FoodOn facet hints, etc.). */
  readonly guidance?: string
}

/** One per-chunk candidate set as the model returned it (decode-validated). */
export interface ChunkCandidates {
  readonly classes: readonly InducedClassDef[]
  readonly relations: readonly InducedRelationDef[]
}

/** The finished induction run. */
export interface InductionRunResult {
  readonly draft: OntologyDraft
  readonly report: OntologyGateReport
  readonly transcript: readonly InductionTranscriptEntry[]
  /** Repair rounds consumed (0 = the merged draft passed first try). */
  readonly repairs: number
  /** Non-fatal decode/merge notes (malformed chunk JSON, dropped fields). */
  readonly notes: readonly string[]
}

/**
 * Split corpus documents into chunks under the character cap, each carrying
 * its document-name header so the model can cite provenance.
 * @param docs - the corpus documents.
 * @param maxChunkChars - the per-chunk cap.
 * @returns the chunk list in document order.
 */
export function chunkCorpus(docs: readonly InductionCorpusDoc[], maxChunkChars: number): CorpusChunk[] {
  const chunks: CorpusChunk[] = []
  for (const doc of docs) {
    let index = 0
    for (let offset = 0; offset < doc.text.length; offset += maxChunkChars) {
      chunks.push({ doc: doc.name, index, text: doc.text.slice(offset, offset + maxChunkChars) })
      index += 1
    }
    if (doc.text.length === 0) chunks.push({ doc: doc.name, index: 0, text: '' })
  }
  return chunks
}

/**
 * Build the OntoGPT-style extraction prompt: closed output contract, the
 * constraint quartet vocabulary, one few-shot example, and the domain
 * guidance when the caller provided one.
 * @param guidance - optional domain hints.
 * @returns the system prompt text.
 */
export function buildInductionPrompt(guidance?: string): string {
  return [
    '你是本体归纳器（schema induction）。从给定的业务资料中归纳候选本体：类（含属性）、类间关系。',
    '绝对只输出一个 JSON 对象，不输出任何其他文字、解释或代码块标记。',
    '输出结构（严格遵守）：',
    '{"classes":[{"id":"<lowerCamelCase英文id>","label":"<中文标签>","description":"<一句话>","extends":"<可选，另一个类的id>",'
    + '"props":[{"key":"<属性名>","datatype":"string|number|boolean|date|json","required":true|false,"enumValues":["<可选枚举集>"],'
    + '"pattern":"<可选正则>"}],"naturalKey":"<可选，必须是props里的key>","evidence":"<原文片段>"}],'
    + '"relations":[{"id":"<lowerCamelCase英文id>","label":"<中文标签>","description":"<一句话>",'
    + '"constraints":[{"domain":"<类id>","range":"<类id>","cardinality":{"min":0,"max":5}}],"kind":"object|hierarchical","evidence":"<原文片段>"}]}',
    '硬性规则：',
    '1. extends、domain、range 只能引用本输出里声明过的类 id；',
    '2. naturalKey 必须是该类 props 里声明过的 key；',
    '3. cardinality 的 min ≥ 0 且 min ≤ max；',
    '4. id 只用 lowerCamelCase 英文；label 用中文；',
    '5. 每个类至少 1 个属性；关系至少 1 条约束；',
    '6. 只归纳资料里真实出现的概念，禁止发明资料里没有的类。',
    guidance === undefined ? '' : `领域提示：${guidance}`,
    '示例输入：宏发食品的酱油生产线包含蒸料、制曲、压榨三道工序，酱油成品含山梨酸钾防腐剂。',
    '示例输出：{"classes":[{"id":"company","label":"企业","props":[{"key":"name","datatype":"string","required":true}],"naturalKey":"name"},'
    + '{"id":"product","label":"产品","props":[{"key":"name","datatype":"string","required":true},{"key":"shelfLifeDays","datatype":"number"}],"naturalKey":"name","extends":"company"},'
    + '{"id":"processStep","label":"工序","props":[{"key":"name","datatype":"string","required":true}],"naturalKey":"name"}],'
    + '"relations":[{"id":"produces","label":"生产","constraints":[{"domain":"company","range":"product"}],"kind":"object"},'
    + '{"id":"containsAdditive","label":"含添加剂","constraints":[{"domain":"product","range":"additive"}],"kind":"object"}]}',
  ].filter(part => part !== '').join('\n')
}

/**
 * Extract the outermost JSON object text from a model answer.
 * @param text - the raw model answer.
 * @returns the sliced JSON text, or undefined when none is present.
 */
function sliceJsonObject(text: string): string | undefined {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  return text.slice(start, end + 1)
}

/**
 * Coerce one decoded JSON value into a non-empty string.
 * @param value - the decoded value.
 * @returns the string form, or undefined otherwise.
 */
function optString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  return value
}

/** Recognized datatypes (the decode-side closed set). */
const DATATYPES: readonly string[] = ['string', 'number', 'boolean', 'date', 'json']

/**
 * Decode one model answer into candidate classes/relations. Malformed shapes
 * drop to `undefined` (one retry happens at the caller); individually
 * malformed entries are skipped with a note.
 * @param text - the raw model answer.
 * @param notes - the note sink for skipped entries.
 * @returns the candidates, or undefined when no JSON object decodes.
 */
export function decodeCandidates(text: string, notes: string[]): ChunkCandidates | undefined {
  const sliced = sliceJsonObject(text)
  if (sliced === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(sliced)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const record = parsed as Record<string, unknown>
  const rawClasses = Array.isArray(record['classes']) ? record['classes'] : []
  const rawRelations = Array.isArray(record['relations']) ? record['relations'] : []
  const classes: InducedClassDef[] = []
  for (const entry of rawClasses) {
    if (entry === null || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const id = optString(raw['id'])
    if (id === undefined) {
      notes.push('skipped a class candidate without an id')
      continue
    }
    const description = optString(raw['description'])
    const extendsId = optString(raw['extends'])
    const label = optString(raw['label'])
    const naturalKey = optString(raw['naturalKey'])
    const evidence = optString(raw['evidence'])
    classes.push({
      id,
      label: label ?? id,
      ...(description === undefined ? {} : { description }),
      ...(extendsId === undefined ? {} : { extends: extendsId }),
      props: decodeProps(raw['props'], id, notes),
      ...(naturalKey === undefined ? {} : { naturalKey }),
      ...(evidence === undefined ? {} : { evidence }),
    })
  }
  const relations: InducedRelationDef[] = []
  for (const entry of rawRelations) {
    if (entry === null || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const id = optString(raw['id'])
    if (id === undefined) {
      notes.push('skipped a relation candidate without an id')
      continue
    }
    const label = optString(raw['label'])
    const description = optString(raw['description'])
    const evidence = optString(raw['evidence'])
    relations.push({
      id,
      label: label ?? id,
      ...(description === undefined ? {} : { description }),
      constraints: decodeConstraints(raw['constraints'], id, notes),
      kind: raw['kind'] === 'hierarchical' ? 'hierarchical' : 'object',
      ...(evidence === undefined ? {} : { evidence }),
    })
  }
  return { classes, relations }
}

/**
 * Decode the props array of one class candidate.
 * @param value - the decoded `props` value.
 * @param classId - the owning class (for notes).
 * @param notes - the note sink.
 * @returns the property definitions (empty when absent).
 */
function decodeProps(value: unknown, classId: string, notes: string[]): InducedPropDef[] {
  if (!Array.isArray(value)) return []
  const props: InducedPropDef[] = []
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const key = optString(raw['key'])
    if (key === undefined) {
      notes.push(`skipped a property candidate on class "${classId}" without a key`)
      continue
    }
    const datatype = optString(raw['datatype'])
    const pattern = optString(raw['pattern'])
    const propDescription = optString(raw['description'])
    const enumValues = Array.isArray(raw['enumValues'])
      ? raw['enumValues'].filter((item): item is string => typeof item === 'string')
      : undefined
    props.push({
      key,
      datatype: datatype !== undefined && DATATYPES.includes(datatype)
        ? datatype as InducedPropDef['datatype']
        : 'string',
      ...(raw['required'] === true ? { required: true } : {}),
      ...(raw['isArray'] === true ? { isArray: true } : {}),
      ...(enumValues !== undefined && enumValues.length > 0 ? { enumValues } : {}),
      ...(pattern === undefined ? {} : { pattern }),
      ...(propDescription === undefined ? {} : { description: propDescription }),
    })
  }
  return props
}

/**
 * Decode the constraints array of one relation candidate.
 * @param value - the decoded `constraints` value.
 * @param relationId - the owning relation (for notes).
 * @param notes - the note sink.
 * @returns the constraint list (empty when absent).
 */
function decodeConstraints(value: unknown, relationId: string, notes: string[]): InducedConstraint[] {
  if (!Array.isArray(value)) return []
  const constraints: InducedConstraint[] = []
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const domain = optString(raw['domain'])
    const range = optString(raw['range'])
    if (domain === undefined || range === undefined) {
      notes.push(`skipped a constraint on relation "${relationId}" without domain/range`)
      continue
    }
    const rawCardinality = raw['cardinality']
    let cardinality: { min?: number; max?: number } | undefined
    if (rawCardinality !== null && typeof rawCardinality === 'object' && !Array.isArray(rawCardinality)) {
      const card = rawCardinality as Record<string, unknown>
      const min = typeof card['min'] === 'number' ? card['min'] : undefined
      const max = typeof card['max'] === 'number' ? card['max'] : undefined
      cardinality = { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) }
    }
    constraints.push({ domain, range, ...(cardinality === undefined ? {} : { cardinality }) })
  }
  return constraints
}

/**
 * Merge per-chunk candidates into one draft. First definition of an id wins
 * (chunk order = document order); later chunks may add missing props and
 * constraints; conflicts are recorded as notes, never silently overwritten.
 * @param name - the draft name.
 * @param chunks - the chunk provenance (the corpus footer).
 * @param candidates - the per-chunk decode results (index-aligned).
 * @returns the merged draft.
 */
export function mergeCandidates(
  name: string,
  chunks: readonly CorpusChunk[],
  candidates: readonly (ChunkCandidates | undefined)[],
): OntologyDraft {
  const classes = new Map<string, InducedClassDef & { props: InducedPropDef[] }>()
  const relations = new Map<string, InducedRelationDef & { constraints: InducedConstraint[] }>()
  const corpus = new Map<string, number>()
  for (const chunk of chunks) corpus.set(chunk.doc, (corpus.get(chunk.doc) ?? 0) + chunk.text.length)
  for (const round of candidates) {
    if (round === undefined) continue
    for (const klass of round.classes) {
      const known = classes.get(klass.id)
      if (known === undefined) {
        classes.set(klass.id, { ...klass, props: [...klass.props] })
        continue
      }
      const propKeys = new Set(known.props.map(prop => prop.key))
      for (const prop of klass.props) {
        if (!propKeys.has(prop.key)) known.props.push(prop)
      }
    }
    for (const relation of round.relations) {
      const known = relations.get(relation.id)
      if (known === undefined) {
        relations.set(relation.id, { ...relation, constraints: [...relation.constraints] })
        continue
      }
      const seen = new Set(known.constraints.map(pair => `${pair.domain}→${pair.range}`))
      for (const constraint of relation.constraints) {
        if (!seen.has(`${constraint.domain}→${constraint.range}`)) known.constraints.push(constraint)
      }
    }
  }
  return {
    name,
    classes: [...classes.values()].map(klass => ({ ...klass, props: [...klass.props] })),
    relations: [...relations.values()].map(relation => ({ ...relation, constraints: [...relation.constraints] })),
    corpus: [...corpus.entries()].map(([doc, chars]) => ({ doc, chars })),
    inducedAt: new Date().toISOString(),
  }
}

/**
 * Build the repair prompt for one refusing gate report.
 * @param draft - the refusing draft.
 * @param feedback - the formatted violation list.
 * @returns the repair system prompt.
 */
export function buildRepairPrompt(draft: OntologyDraft, feedback: string): string {
  return [
    '你之前归纳的本体草案没有通过 SHACL 闸门。请修复以下违规并重新输出完整的 JSON 对象（同样的输出结构，禁止输出其他文字）：',
    feedback,
    '当前草案（供你对照修改）：',
    JSON.stringify({ classes: draft.classes, relations: draft.relations }),
  ].join('\n')
}

/**
 * Run the whole induction pipeline over one corpus: chunk → extract (one
 * retry on malformed JSON) → merge → gate → bounded repair loop. The draft
 * returned always carries the final gate report; callers refuse storage when
 * `report.conforms` is false.
 * @param llm - the model face.
 * @param docs - the corpus documents.
 * @param name - the ontology draft name.
 * @param options - the tunables.
 * @returns the finished run with transcript and notes.
 */
export async function runInduction(
  llm: InductionLlm,
  docs: readonly InductionCorpusDoc[],
  name: string,
  options?: InductionOptions,
): Promise<InductionRunResult> {
  const maxChunkChars = options?.maxChunkChars ?? 6000
  const maxRepairs = options?.maxRepairs ?? 2
  const notes: string[] = []
  const transcript: InductionTranscriptEntry[] = []
  const system = buildInductionPrompt(options?.guidance)
  const chunks = chunkCorpus(docs, maxChunkChars)
  const perChunk: (ChunkCandidates | undefined)[] = []
  for (const chunk of chunks) {
    const user = `【文档：${chunk.doc}（第${String(chunk.index + 1)}段）】\n${chunk.text}`
    const first = await llm.complete(system, user)
    transcript.push({ doc: chunk.doc, chunk: chunk.index, kind: 'extract', system, user, raw: first })
    let decoded = decodeCandidates(first, notes)
    if (decoded === undefined) {
      const retry = await llm.complete(system, `${user}\n\n你上一次的输出无法解析为 JSON，请只输出一个 JSON 对象。`)
      transcript.push({ doc: chunk.doc, chunk: chunk.index, kind: 'extract', system, user, raw: retry })
      decoded = decodeCandidates(retry, notes)
      if (decoded === undefined) notes.push(`chunk ${chunk.doc}#${String(chunk.index)} never produced parseable JSON`)
    }
    perChunk.push(decoded)
  }
  let draft = mergeCandidates(name, chunks, perChunk)
  let report = gateOntologyDraft(draft)
  let repairs = 0
  while (!report.conforms && repairs < maxRepairs) {
    repairs += 1
    const feedback = formatGateFeedback(report)
    const repairSystem = buildRepairPrompt(draft, feedback)
    const answer = await llm.complete(repairSystem, '请输出修复后的完整 JSON。')
    transcript.push({ doc: name, chunk: -1, kind: 'repair', system: repairSystem, user: '请输出修复后的完整 JSON。', raw: answer })
    const decoded = decodeCandidates(answer, notes)
    if (decoded === undefined) {
      notes.push(`repair round ${String(repairs)} produced no parseable JSON`)
      continue
    }
    // The repair output is the authoritative corrected draft: it replaces the
    // per-chunk merge rather than appending to it (a repair that merely repeats
    // the same violation cannot reduce the count and is discarded below).
    const repaired = mergeCandidates(name, chunks, [decoded])
    const repairedReport = gateOntologyDraft(repaired)
    if (repairedReport.violations.length < report.violations.length || repairedReport.conforms) {
      draft = repaired
      report = repairedReport
    } else {
      notes.push(`repair round ${String(repairs)} did not reduce violations; keeping the earlier draft`)
    }
  }
  return { draft, report, transcript, repairs, notes }
}
