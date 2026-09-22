/**
 * The minimal SHACL-shaped validator: compiles the ontology registry's
 * constraint quartet (required/isArray/enumValues/pattern) plus relation
 * domain/range pairs into an internal shapes IR, then validates in-memory
 * extraction candidates against it — a closed-world check with no RDF
 * runtime (the「SHACL as semantic contract, not RDF machinery」path from the
 * research verdict). The report mirrors the W3C result vocabulary
 * (focusNode/path/value/message/sourceConstraintComponent) so the feedback
 * formatter's explanatory sentences slot straight into the extraction retry
 * loop, and a future swap to a full SHACL engine changes no caller.
 * @module @deepseek-ai/dsh-kb-graph/shacl
 */

import type { KgNodeType, KgPropDef, KgRelation } from './types.ts'

/** One property shape: the quartet compiled onto one property key. */
export interface ShaclPropertyShape {
  readonly path: string
  readonly datatype?: KgPropDef['datatype']
  readonly enumValues?: readonly string[]
  readonly pattern?: string
  readonly isArray?: boolean
  readonly required?: boolean
}

/** One node shape: the class's property shapes. A class with zero declared
 * props yields no property checks (no shape claims to validate against). */
export interface ShaclNodeShape {
  readonly targetClass: string
  readonly props: readonly ShaclPropertyShape[]
}

/** One direction constraint with its optional cardinality bounds. */
export interface ShaclRelationShape {
  readonly domain: string
  readonly range: string
  readonly cardinality?: { readonly min?: number; readonly max?: number }
}

/** The compiled shapes document. */
export interface ShaclShapes {
  readonly nodeShapes: ReadonlyMap<string, ShaclNodeShape>
  readonly relationShapes: ReadonlyMap<string, readonly ShaclRelationShape[]>
}

/** One entity candidate to validate. */
export interface ShaclEntityCandidate {
  readonly name: string
  readonly typeId: string
  readonly props?: Readonly<Record<string, unknown>>
}

/** One edge candidate to validate. */
export interface ShaclEdgeCandidate {
  readonly relationId: string
  readonly srcName: string
  readonly srcTypeId: string
  readonly dstName: string
  readonly dstTypeId: string
}

/** One validation result (the W3C result vocabulary, projected). */
export interface ShaclResult {
  readonly focusNode: string
  readonly path?: string
  readonly value?: string
  readonly message: string
  readonly sourceConstraintComponent: string
}

/** The validation report. */
export interface ShaclReport {
  readonly conforms: boolean
  readonly results: readonly ShaclResult[]
}

/**
 * Compile the registry snapshot into the shapes IR.
 * @param input - the registered node types and relations.
 * @returns the compiled shapes.
 */
export function compileShaclShapes(input: {
  readonly nodeTypes: readonly KgNodeType[]
  readonly relations: readonly KgRelation[]
}): ShaclShapes {
  const nodeShapes = new Map<string, ShaclNodeShape>()
  for (const type of input.nodeTypes) {
    nodeShapes.set(String(type.id), {
      targetClass: String(type.id),
      props: type.props.map(prop => ({
        path: prop.key,
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- datatype is optional on KgPropDef.
        ...(prop.datatype === undefined ? {} : { datatype: prop.datatype }),
        ...(prop.enumValues === undefined ? {} : { enumValues: prop.enumValues }),
        ...(prop.pattern === undefined ? {} : { pattern: prop.pattern }),
        ...(prop.isArray === undefined ? {} : { isArray: prop.isArray }),
        ...(prop.required === undefined ? {} : { required: prop.required }),
      })),
    })
  }
  const relationShapes = new Map<string, readonly ShaclRelationShape[]>()
  for (const relation of input.relations) {
    relationShapes.set(
      String(relation.id),
      relation.constraints.map(pair => ({
        domain: String(pair.domain),
        range: String(pair.range),
        ...(pair.cardinality === undefined ? {} : { cardinality: pair.cardinality }),
      })),
    )
  }
  return { nodeShapes, relationShapes }
}

/** Datatype-arm of one value check; returns the violation message or undefined. */
function datatypeViolation(datatype: NonNullable<KgPropDef['datatype']>, value: unknown): string | undefined {
  switch (datatype) {
    case 'string':
      return typeof value === 'string' ? undefined : '必须是字符串'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? undefined : '必须是有限数字'
    case 'boolean':
      return typeof value === 'boolean' ? undefined : '必须是布尔值'
    case 'date':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? undefined : '必须是可解析的日期字符串'
    case 'json':
      return typeof value === 'object' && value !== null ? undefined : '必须是 JSON 对象'
  }
}

/** Check one scalar against one property shape; returns the violation message or undefined. */
function scalarViolation(shape: ShaclPropertyShape, value: unknown): string | undefined {
  if (shape.datatype !== undefined) {
    const violation = datatypeViolation(shape.datatype, value)
    if (violation !== undefined) return `值 ${JSON.stringify(value)} ${violation}`
  }
  if (shape.enumValues !== undefined && !shape.enumValues.includes(String(value))) {
    return `值 ${JSON.stringify(value)} 不在枚举闭集 [${shape.enumValues.join(', ')}] 内`
  }
  if (shape.pattern !== undefined && (typeof value !== 'string' || !new RegExp(shape.pattern, 'u').test(value))) {
    return `值 ${JSON.stringify(value)} 不匹配约束正则 /${shape.pattern}/`
  }
  return undefined
}

/**
 * Validate one candidate batch against the compiled shapes: entity property
 * shapes (datatype/enum/pattern/required/isArray) and edge direction pairs
 * with max-cardinality on the batch.
 * @param shapes - the compiled shapes IR.
 * @param entities - the entity candidates.
 * @param edges - the edge candidates.
 * @returns the report (`conforms` true iff no results).
 */
export function validateShaclCandidates(
  shapes: ShaclShapes,
  entities: readonly ShaclEntityCandidate[],
  edges: readonly ShaclEdgeCandidate[],
): ShaclReport {
  const results: ShaclResult[] = []
  for (const entity of entities) {
    const shape = shapes.nodeShapes.get(entity.typeId)
    if (shape === undefined) {
      results.push({
        focusNode: entity.name,
        message: `实体类型 "${entity.typeId}" 不在本体注册表中`,
        sourceConstraintComponent: 'ClassConstraintComponent',
      })
      continue
    }
    // A class that declares no property shapes claims nothing to validate.
    if (shape.props.length === 0) continue
    const declaredKeys = new Set<string>()
    for (const propShape of shape.props) {
      const value = entity.props?.[propShape.path]
      if (value === undefined) {
        if (propShape.required === true) {
          results.push({
            focusNode: entity.name,
            path: propShape.path,
            message: `必填属性 "${propShape.path}" 缺失`,
            sourceConstraintComponent: 'MinCountConstraintComponent',
          })
        }
        continue
      }
      declaredKeys.add(propShape.path)
      if (propShape.isArray === true) {
        if (!Array.isArray(value)) {
          results.push({
            focusNode: entity.name,
            path: propShape.path,
            value: JSON.stringify(value),
            message: `属性 "${propShape.path}" 声明为数组，但值不是数组`,
            sourceConstraintComponent: 'NodeKindConstraintComponent',
          })
          continue
        }
        for (const item of value) {
          const violation = scalarViolation(propShape, item)
          if (violation !== undefined) {
            results.push({
              focusNode: entity.name,
              path: propShape.path,
              value: JSON.stringify(item),
              message: `属性 "${propShape.path}" 的数组元素${violation}`,
              sourceConstraintComponent: 'DatatypeConstraintComponent',
            })
          }
        }
        continue
      }
      const violation = scalarViolation(propShape, value)
      if (violation !== undefined) {
        results.push({
          focusNode: entity.name,
          path: propShape.path,
          value: JSON.stringify(value),
          message: `属性 "${propShape.path}" ${violation}`,
          sourceConstraintComponent: propShape.enumValues !== undefined
            ? 'InConstraintComponent'
            : propShape.pattern !== undefined
              ? 'PatternConstraintComponent'
              : 'DatatypeConstraintComponent',
        })
      }
    }
    for (const key of Object.keys(entity.props ?? {})) {
      if (declaredKeys.has(key)) continue
      results.push({
        focusNode: entity.name,
        path: key,
        message: `属性 "${key}" 不在类型 "${entity.typeId}" 的闭包属性集中（闭世界校验）`,
        sourceConstraintComponent: 'ClosedConstraintComponent',
      })
    }
  }
  // Edge direction + batch max-cardinality checks.
  const perSourceCount = new Map<string, number>()
  for (const edge of edges) {
    const constraints = shapes.relationShapes.get(edge.relationId)
    if (constraints === undefined) {
      results.push({
        focusNode: `${edge.srcName} —[${edge.relationId}]→ ${edge.dstName}`,
        message: `关系 "${edge.relationId}" 不在本体注册表中`,
        sourceConstraintComponent: 'ClassConstraintComponent',
      })
      continue
    }
    if (constraints.length === 0) continue
    const pair = constraints.find(c => c.domain === edge.srcTypeId && c.range === edge.dstTypeId)
    if (pair === undefined) {
      results.push({
        focusNode: `${edge.srcName} —[${edge.relationId}]→ ${edge.dstName}`,
        value: `${edge.srcTypeId}→${edge.dstTypeId}`,
        message: `关系 "${edge.relationId}" 只允许 ${constraints.map(c => `${c.domain}→${c.range}`).join(' / ')}，不允许 ${edge.srcTypeId}→${edge.dstTypeId}`,
        sourceConstraintComponent: 'ClassConstraintComponent',
      })
      continue
    }
    if (pair.cardinality?.max !== undefined) {
      const key = `${edge.srcTypeId}:${edge.srcName}:${edge.relationId}:${edge.dstTypeId}`
      const count = (perSourceCount.get(key) ?? 0) + 1
      perSourceCount.set(key, count)
      if (count > pair.cardinality.max) {
        results.push({
          focusNode: `${edge.srcName} —[${edge.relationId}]→ ${edge.dstName}`,
          message: `关系 "${edge.relationId}"（${pair.domain}→${pair.range}）的最大基数为 ${String(pair.cardinality.max)}，本批次中 ${edge.srcName} 已超过`,
          sourceConstraintComponent: 'MaxCountConstraintComponent',
        })
      }
    }
  }
  return { conforms: results.length === 0, results }
}

/**
 * Format the report as the explanatory feedback block the extraction retry
 * prompt embeds. Every result becomes one numbered, named sentence — the
 * correction-loop evidence shows判决-only feedback repairs 0/30 while
 * explanatory sentences repair 19/30 — and the trailing hard rule forbids
 * touching unnamed entries (the附带损伤 defense).
 * @param report - the failing report.
 * @returns the feedback text (empty when the report conforms).
 */
export function formatShaclFeedback(report: ShaclReport): string {
  if (report.conforms) return ''
  const lines = report.results.map((result, index) => {
    const located = result.path === undefined ? result.focusNode : `${result.focusNode} 的属性 "${result.path}"`
    const value = result.value === undefined ? '' : `（当前值 ${result.value}）`
    return `${String(index + 1)}. ${located}${value}：违反 ${result.message}（${result.sourceConstraintComponent}）`
  })
  return [
    '你上一轮抽取的以下候选未通过本体约束校验，请修正后重新输出（仅重出被点名的条目，禁止改动未点名条目，其余条目保持原样输出）：',
    ...lines,
  ].join('\n')
}
