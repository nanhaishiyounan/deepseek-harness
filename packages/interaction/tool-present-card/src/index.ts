/**
 * Model-facing `present_card` tool: the deterministic output channel for the
 * mobile structured-card protocol (v:3 envelope). The persona instructs the
 * model to call this tool instead of emitting ```dsh text fences; the tool
 * validates the payload against a closed nine-branch oneOf schema plus
 * execute-level count bounds, ends the turn on success (the card is the turn's
 * final artifact — the model cannot answer on the user's behalf after it), and
 * reports violations back as tool errors so the model corrects and retries.
 * Fire-and-forget: it never waits for the user; the user's pick or confirmation
 * arrives as the next ordinary user message, byte-identical to the legacy
 * fence UX. The payload branches mirror the assistant-side `DshPayload` types
 * of `@deepseek-ai/dsh-client-ui-mobile`'s protocol module; the four
 * user-action payloads stay client-fenced and are deliberately absent. The
 * fixture corpus under tests/fixtures is the mirror source for the client-side
 * args-level validator — change the protocol on both sides in one PR.
 *
 * W21-R1 leniency contract, both mirrors in lockstep: the id/value/count leaf
 * positions accept bare numbers and normalize them to strings as an explicit
 * `resolvePresentCardPayload` step before structural validation (a coerced
 * payload behaves exactly like the equivalent all-strings payload), a payload
 * that arrives as a JSON string (the double-serialization shape old-fence
 * contexts induce) is parsed first, and every structural violation names the
 * offending field path in Chinese so one retry hits. Booleans, arrays,
 * objects, and nulls at those leaves stay rejected. A required scalar leaf
 * also rejects the empty string (W21-R3, the client `requiredText`/
 * `coercedText` parity); the draft-field `value` keeps `""` as the
 * "generated after landing" spelling, and a blank report table cell stays
 * legal.
 *
 * W21-R2 non-interception contract: the declared `payload` parameter accepts
 * any lossless JSON value (`type: 'json'`), so the framework-level oneOf
 * matcher never rejects a model-produced payload shape — every violation,
 * including enum and discriminator out-of-range values, reaches
 * `resolvePresentCardPayload` and comes back with its field path and the
 * legal candidates. An exact-one oneOf cannot carry a fallback branch beside
 * the nine strict branches (a valid object would match two branches), so the
 * nine-branch skeleton stays the walk's authority and moves its model-facing
 * guidance into the parameter description. `widget` is required on both
 * mirrors (the card cannot render without it), and an explicit null at an
 * optional leaf without an enum/const constraint means "left this one out"
 * (omitted, mirroring the client parser); optional enum leaves keep
 * rejecting null.
 *
 * W21-R8 actions leniency contract, both mirrors in lockstep: a report
 * action element that arrives as a single-key wrapper
 * (`{"view":{"label":…,"route":…}}` — the compact union notation reads that
 * way) is flattened, a missing `kind` discriminant is filled when exactly
 * one branch's other required fields are all present (`{label,route}` →
 * view; an explicit illegal `kind` is never overridden), a lone actions
 * object lifts to the one-element array, and a discriminant failure reports
 * the concrete JSON skeletons of the four branches so one retry hits.
 *
 * W22-R1 determinism contract, two server-side mechanisms the model no
 * longer decides: (1) the widget kind on `form_draft` fields and the
 * `ask_field` field is rewritten by the field-name/label resolver
 * (quantity/price/amount families → number, date families → date, non-empty
 * options → select) — the model's declared widget loses only where the
 * classification is mechanical, and the rewritten payload keeps riding the
 * full validation; (2) the optional `formCollections` config pins the
 * collection whitelist and per-collection required-field floor for
 * `form_draft` (fields must appear on the card; values may stay prefilled),
 * failing closed with pathed Chinese errors the model corrects in one
 * retry. An unconfigured deployment keeps the contract-free behavior.
 *
 * @module @deepseek-ai/dsh-tool-present-card
 */

import type { Context } from '@deepseek-ai/cordis'
import { assertNever } from '@deepseek-ai/dsh-llm'
import {
  defineTool,
  ToolArgsError,
  type ArrayValueSchemaSpec,
  type BooleanValueSchemaSpec,
  type InferValue,
  type IntegerValueSchemaSpec,
  type ObjectValueSchemaSpec,
  type OneOfValueSchemaSpec,
  type StringValueSchemaSpec,
  type ValueSchemaSpec,
} from '@deepseek-ai/dsh-tools'
import { enforceFormContract, type Config } from './form-contract.ts'
import { applyDeterministicWidgets } from './widget.ts'

export { enforceFormContract } from './form-contract.ts'
export type { Config, FormCollectionSpec, FormCollections, RequiredFieldGroup } from './form-contract.ts'
export { applyDeterministicWidgets, inferWidgetKind } from './widget.ts'
export type { WidgetKind } from './widget.ts'

export const name = 'tool-present-card'
export const inject = ['tools']

const description = '向用户呈现结构化卡片（ask_choice/ask_field/form_draft/submit_receipt/report/'
  + 'approval_pending/approval_result/plan_suggest/plan_result 九类载荷）。凡需用户点选或结构化呈现的内容'
  + '必须且只能通过本工具输出，禁止在回复文本中输出 ```dsh 围栏、JSON 块或裸选项列表。'
  + '先写不超过两句的人话叙述，再调用本工具：工具成功即本回合结束，其后的任何叙述都不会发出。'
  + '同一回合要出多张卡时必须在同一批并行调用多个 present_card。'
  + '载荷中 id/value/数量类叶子字段可直接传数字（自动转为字符串）；payload 也可传其 JSON 字符串（自动解析）。'
  + '参数校验失败会返回带字段路径的错误信息：按其修正参数后重试，最多两次；仍失败就用一句业务语言如实说明并结束。'

/** The envelope version every payload branch pins with `v`. */
const ENVELOPE_VERSION = 3

/**
 * An id/value-like leaf that also accepts bare numbers (integers included),
 * coerced to strings by the explicit resolve step. One scalar `number` branch
 * suffices — adding an `integer` branch would make an integer match two
 * branches and fail the union's exact-one rule. Narrative leaves (question,
 * label, title…) stay string-only.
 */
const coercedText = { oneOf: [{ type: 'string' }, { type: 'number' }] } as const

/** A pre-formatted numeric leaf (report metric values, table cells). */
const coercedNumberText = { oneOf: [{ type: 'string' }, { type: 'number' }] } as const

/** A draft field value: string or null as before, plus coerced numbers. */
const coercedFieldValue = { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] } as const

const summaryRowSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string', required: true },
    value: { ...coercedText, required: true },
    kind: { type: 'string', enum: ['money', 'date', 'id', 'count', 'text'], required: true },
  },
} as const

const widgetSchema = { type: 'string', enum: ['text', 'number', 'date', 'select', 'relation'] } as const

const formRefSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    collection: { type: 'string', required: true },
    label: { type: 'string', required: true },
  },
} as const

const approvalDocSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    collection: { type: 'string', required: true },
    label: { type: 'string', required: true },
    docId: { ...coercedText, required: true },
    title: { type: 'string', required: true },
  },
} as const

const reportActionSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'view', required: true },
        label: { type: 'string', required: true },
        route: { type: 'string', required: true },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'create-task', required: true },
        label: { type: 'string', required: true },
        title: { type: 'string', required: true },
        suggestion: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'send', required: true },
        label: { type: 'string', required: true },
        text: { type: 'string', required: true },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'link', required: true },
        label: { type: 'string', required: true },
        url: { type: 'string', required: true },
      },
    },
  ],
} as const

/** The closed nine-branch assistant payload union, one object schema per branch. */
const payloadBranches = [
  {
    type: 'object',
    description: '选择卡：一个问题加可点选项',
    additionalProperties: false,
    properties: {
      v: { type: 'integer', const: ENVELOPE_VERSION, required: true },
      type: { type: 'string', const: 'ask_choice', required: true },
      id: { ...coercedText, required: true },
      mode: { type: 'string', enum: ['single', 'multi'], required: true },
      variant: { type: 'string', enum: ['cards', 'chips', 'buttons'], required: true },
      question: { type: 'string', required: true },
      options: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            label: { type: 'string', required: true },
            value: { ...coercedText, required: true },
            hint: { type: 'string' },
            send: { type: 'string' },
          },
        },
      },
      allowFreeText: { type: 'boolean', required: true },
    },
  },
  {
    type: 'object',
    description: '单字段追问卡：一次只问一个必答字段',
    additionalProperties: false,
    properties: {
      v: { type: 'integer', const: ENVELOPE_VERSION, required: true },
      type: { type: 'string', const: 'ask_field', required: true },
      id: { ...coercedText, required: true },
      question: { type: 'string', required: true },
      field: {
        type: 'object',
        required: true,
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          label: { type: 'string', required: true },
          widget: { ...widgetSchema, required: true },
          unit: { type: 'string' },
          suggestions: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string', required: true },
                value: { ...coercedText, required: true },
                hint: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
  {
    type: 'object',
    description: '三层草稿卡：必答/推导/系统字段。widget 按字段性质选：select（有限枚举如状态/方式，必带 options 候选）date（YYYY-MM-DD 日期）number（数量/金额）text（编号/备注/名称）relation（关联表行，不带 options）',
    additionalProperties: false,
    properties: {
      v: { type: 'integer', const: ENVELOPE_VERSION, required: true },
      type: { type: 'string', const: 'form_draft', required: true },
      draftId: { ...coercedText, required: true },
      revision: { type: 'integer', required: true },
      form: formRefSchema,
      title: { type: 'string', required: true },
      fields: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', required: true },
            label: { type: 'string', required: true },
            value: { ...coercedFieldValue, required: true },
            tier: { type: 'string', enum: ['required', 'derived', 'system'], required: true },
            rationale: { type: 'string' },
            edited: { type: 'boolean' },
            widget: { ...widgetSchema, required: true },
            options: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  label: { type: 'string', required: true },
                  value: { ...coercedText, required: true },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    type: 'object',
    description: '落库回执卡：一次真实 nb_create 成功之后才允许',
    additionalProperties: false,
    properties: {
      v: { type: 'integer', const: ENVELOPE_VERSION, required: true },
      type: { type: 'string', const: 'submit_receipt', required: true },
      draftId: { ...coercedText, required: true },
      form: formRefSchema,
      rowId: { ...coercedText, required: true },
      summary: { type: 'array', required: true, items: summaryRowSchema },
    },
  },
  {
    type: 'object',
    description: '报告卡：指标/条目/对比表/动作按钮',
    additionalProperties: false,
    properties: {
      v: { type: 'integer', const: ENVELOPE_VERSION, required: true },
      type: { type: 'string', const: 'report', required: true },
      id: { ...coercedText, required: true },
      title: { type: 'string', required: true },
      subtitle: { type: 'string' },
      metrics: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            label: { type: 'string', required: true },
            value: { ...coercedNumberText, required: true },
            kind: { type: 'string', enum: ['count', 'money', 'percent', 'text'], required: true },
            tone: { type: 'string', enum: ['positive', 'warning', 'danger'] },
          },
        },
      },
      rows: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            label: { type: 'string', required: true },
            hint: { type: 'string' },
            level: { type: 'string', enum: ['high', 'medium', 'low'], required: true },
          },
        },
      },
      table: {
        type: 'object',
        additionalProperties: false,
        properties: {
          columns: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string', required: true },
                kind: { type: 'string', enum: ['text', 'money', 'percent', 'count'] },
              },
            },
          },
          rows: {
            type: 'array',
            required: true,
            items: { type: 'array', items: coercedNumberText },
          },
        },
      },
      actions: { type: 'array', items: reportActionSchema },
    },
  },
  {
    type: 'object',
    description: '审批待办卡：一张待审单据',
    additionalProperties: false,
    properties: {
      v: { type: 'integer', const: ENVELOPE_VERSION, required: true },
      type: { type: 'string', const: 'approval_pending', required: true },
      id: { ...coercedText, required: true },
      doc: approvalDocSchema,
      applicant: { type: 'string' },
      node: { type: 'string' },
      attempt: { type: 'string' },
      summary: { type: 'array', required: true, items: summaryRowSchema },
    },
  },
  {
    type: 'object',
    description: '审批结果卡：同意/驳回后的落定状态',
    additionalProperties: false,
    properties: {
      v: { type: 'integer', const: ENVELOPE_VERSION, required: true },
      type: { type: 'string', const: 'approval_result', required: true },
      approvalId: { ...coercedText, required: true },
      doc: approvalDocSchema,
      action: { type: 'string', enum: ['approve', 'reject'], required: true },
      state: {
        type: 'string',
        enum: [
          'draft', 'pending', 'pending_level2', 'approved', 'rejected', 'void',
          'potential', 'reviewing', 'qualified',
        ],
        required: true,
      },
      by: { type: 'string', required: true },
      comment: { type: 'string' },
      at: { type: 'string' },
    },
  },
  {
    type: 'object',
    description: '计划建议卡：一条 MRP 建议',
    additionalProperties: false,
    properties: {
      v: { type: 'integer', const: ENVELOPE_VERSION, required: true },
      type: { type: 'string', const: 'plan_suggest', required: true },
      id: { ...coercedText, required: true },
      suggestionId: { ...coercedText, required: true },
      planType: { type: 'string', enum: ['MO', 'PR'], required: true },
      product: { type: 'string', required: true },
      qty: { ...coercedText, required: true },
      suggestDate: { type: 'string' },
      driverSo: { type: 'string' },
      needDate: { type: 'string' },
    },
  },
  {
    type: 'object',
    description: '计划结果卡：确认转单/人工忽略后的落定',
    additionalProperties: false,
    properties: {
      v: { type: 'integer', const: ENVELOPE_VERSION, required: true },
      type: { type: 'string', const: 'plan_result', required: true },
      planId: { ...coercedText, required: true },
      suggestionId: { ...coercedText, required: true },
      planType: { type: 'string', enum: ['MO', 'PR'], required: true },
      product: { type: 'string', required: true },
      outcome: { type: 'string', enum: ['converted', 'dismissed'], required: true },
      docCode: { ...coercedText },
      state: { type: 'string' },
      by: { type: 'string' },
    },
  },
] as const

/** The payload value schema (nine branches, no string fallback) used for the payload type. */
const payloadValueSpec = { oneOf: payloadBranches } as const

/**
 * The nine-branch payload union with id/value/count leaves widened to
 * `string | number` — the pre-normalization shape `execute` receives.
 */
export type PresentCardPayload = InferValue<typeof payloadValueSpec>

/** The nine discriminator `type` values, in branch order. */
const PAYLOAD_TYPES = [
  'ask_choice', 'ask_field', 'form_draft', 'submit_receipt', 'report',
  'approval_pending', 'approval_result', 'plan_suggest', 'plan_result',
] as const

/** One of the nine payload discriminators. */
type PayloadType = (typeof PAYLOAD_TYPES)[number]

/**
 * The payload-schema node kinds {@link walkSchema} handles. `payloadBranches`
 * declares no bare number/null/json leaves (numbers only appear inside scalar
 * unions), so the walk's switch is closed over this union.
 */
type PayloadSchemaSpec =
  | StringValueSchemaSpec
  | IntegerValueSchemaSpec
  | BooleanValueSchemaSpec
  | ArrayValueSchemaSpec
  | ObjectValueSchemaSpec
  | OneOfValueSchemaSpec

/** The schema branch whose `type` const equals the given discriminator. */
function branchOfType(type: PayloadType): PayloadSchemaSpec {
  for (const branch of payloadBranches) {
    const typeProp = branch.properties.type
    if (typeProp.const === type) return branch
  }
  /* v8 ignore next -- every PAYLOAD_TYPES member names exactly one branch const. */
  throw new Error(`present_card: no payload branch for type ${type}`)
}

/** A Chinese noun for one received JSON value, for model-facing diagnostics. */
function showValue(value: unknown): string {
  if (value === undefined) return '缺失'
  if (value === null) return 'null'
  if (typeof value === 'number') return `数字 ${value}`
  if (typeof value === 'boolean') return `布尔值 ${value}`
  if (typeof value === 'string') {
    const shown = value.length > 32 ? `${value.slice(0, 32)}…` : value
    return `字符串 "${shown}"`
  }
  if (Array.isArray(value)) return '数组'
  return '对象'
}

/** The scalar branch type, or undefined for object/array/nested nodes. */
function scalarTypeOf(branch: ValueSchemaSpec): 'string' | 'number' | 'integer' | 'boolean' | 'null' | undefined {
  if ('oneOf' in branch) return undefined
  switch (branch.type) {
    case 'string':
    case 'number':
    case 'integer':
    case 'boolean':
    case 'null':
      return branch.type
    default:
      return undefined
  }
}

/** A short Chinese noun for one scalar schema type. */
function scalarTypeName(type: 'string' | 'number' | 'integer' | 'boolean' | 'null'): string {
  switch (type) {
    case 'string': return '字符串'
    case 'number':
    case 'integer': return '数字'
    case 'boolean': return '布尔值'
    case 'null': return 'null'
  }
}

/** One walk step's normalized value plus the Chinese field-pathed violations. */
interface WalkResult {
  readonly value: unknown
  readonly violations: string[]
}

/**
 * Validate one enum/const-bearing scalar that already matched its primitive
 * type, producing a Chinese field-pathed violation on a literal mismatch.
 */
function checkScalarLiteral(
  spec: StringValueSchemaSpec | IntegerValueSchemaSpec | BooleanValueSchemaSpec,
  value: string | number | boolean | null,
  path: string,
): WalkResult {
  if ('enum' in spec && !(spec.enum as readonly unknown[]).includes(value)) {
    const allowed = (spec.enum as readonly unknown[]).map(entry => JSON.stringify(entry)).join('/')
    return { value, violations: [`${path} 应为 ${allowed} 之一（收到${showValue(value)}）`] }
  }
  if ('const' in spec && value !== spec.const) {
    return { value, violations: [`${path} 应为 ${JSON.stringify(spec.const)}（收到${showValue(value)}）`] }
  }
  return { value, violations: [] }
}

/** One object branch's const discriminant: its field name and const value. */
interface ConstDiscriminant {
  readonly field: string
  readonly value: unknown
}

/** The first const scalar property an object branch discriminates on. */
function constDiscriminantOf(branch: ValueSchemaSpec): ConstDiscriminant | undefined {
  if ('oneOf' in branch || branch.type !== 'object') return undefined
  for (const [key, prop] of Object.entries(branch.properties ?? {})) {
    const constValue = (prop as { const?: unknown }).const
    if (constValue !== undefined) return { field: key, value: constValue }
  }
  return undefined
}

/** The first const scalar each object branch discriminates on, for diagnostics. */
function discriminantValues(branches: readonly ValueSchemaSpec[]): string[] {
  const values: string[] = []
  for (const branch of branches) {
    const discriminant = constDiscriminantOf(branch)
    if (discriminant !== undefined) values.push(JSON.stringify(discriminant.value))
  }
  return values
}

/**
 * A concrete JSON skeleton of one object branch — the const discriminant
 * plus every required field with a `"…"` placeholder — so a discriminant
 * failure shows the shape to copy instead of only the legal values.
 */
function branchSkeleton(branch: ValueSchemaSpec): string | undefined {
  if ('oneOf' in branch || branch.type !== 'object') return undefined
  const parts: string[] = []
  for (const [key, prop] of Object.entries(branch.properties ?? {})) {
    if ((prop as { required?: true }).required !== true) continue
    const constValue = (prop as { const?: unknown }).const
    parts.push(constValue !== undefined
      ? `${JSON.stringify(key)}:${JSON.stringify(constValue)}`
      : `${JSON.stringify(key)}:"…"`)
  }
  return `{${parts.join(',')}}`
}

/** Select the object branch whose const discriminator matches the value's field. */
function selectByConstDiscriminant(branches: readonly ValueSchemaSpec[], value: unknown): PayloadSchemaSpec | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  for (const branch of branches) {
    // The inline object check narrows branch to ObjectValueSchemaSpec; the
    // helper's return carries no narrowing.
    if ('oneOf' in branch || branch.type !== 'object') continue
    const discriminant = constDiscriminantOf(branch)
    if (discriminant !== undefined && record[discriminant.field] === discriminant.value) return branch
  }
  return undefined
}

/**
 * Flatten the wrapper-key spelling of a discriminated member (W21-R8): a
 * single-key object whose key is a branch's const value wrapping that
 * branch's own fields (`{"view":{"label":…,"route":…}}`) merges to the flat
 * shape. The wrapper key wins over an inner discriminant of the same field.
 * @returns the flattened candidate, or undefined when the value is not that
 * spelling.
 */
function unwrapSingleKeyDiscriminant(branches: readonly ValueSchemaSpec[], value: unknown): unknown | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 1) return undefined
  const [key] = keys
  if (key === undefined) return undefined
  const inner = record[key]
  if (typeof inner !== 'object' || inner === null || Array.isArray(inner)) return undefined
  for (const branch of branches) {
    const discriminant = constDiscriminantOf(branch)
    if (discriminant !== undefined && discriminant.value === key) {
      return { ...(inner as Record<string, unknown>), [discriminant.field]: discriminant.value }
    }
  }
  return undefined
}

/**
 * Fill a missing discriminant from a unique required-field signature
 * (W21-R8): when no branch's discriminant field is present and exactly one
 * branch's other required fields are all present, that branch is the only
 * reading (`{label,route}` → view). An explicit-but-illegal discriminant
 * stays a violation — inference never overrides a stated value.
 * @returns the candidate with the discriminant filled, or undefined when
 * zero or several branches match.
 */
function inferMissingDiscriminant(branches: readonly ValueSchemaSpec[], value: unknown): unknown | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const discriminants: { branch: ObjectValueSchemaSpec; discriminant: ConstDiscriminant }[] = []
  for (const branch of branches) {
    if ('oneOf' in branch || branch.type !== 'object') continue
    const discriminant = constDiscriminantOf(branch)
    if (discriminant === undefined) continue
    if (Object.hasOwn(record, discriminant.field)) return undefined
    discriminants.push({ branch, discriminant })
  }
  const candidates = discriminants.filter(({ branch, discriminant }) =>
    Object.entries(branch.properties ?? {}).every(([key, prop]) =>
      key === discriminant.field
      || (prop as { required?: true }).required !== true
      || Object.hasOwn(record, key)))
  if (candidates.length !== 1) return undefined
  const [candidate] = candidates
  if (candidate === undefined) return undefined
  return { ...record, [candidate.discriminant.field]: candidate.discriminant.value }
}

/**
 * Whether an optional property without a literal constraint treats an
 * explicit null as absent. Enum/const-bearing properties are excluded so a
 * present-but-null enum value still reports as a violation.
 */
function isNullOmissible(prop: Readonly<{ required?: true; enum?: unknown; const?: unknown }>): boolean {
  if ((prop as { required?: true }).required === true) return false
  return !Object.hasOwn(prop, 'enum') && !Object.hasOwn(prop, 'const')
}

/**
 * Walk one schema branch against a candidate value, normalizing as it goes:
 * scalar-union leaves (string|number|integer) coerce finite numbers to
 * strings, and every mismatch becomes a Chinese field-pathed violation. The
 * payload schema is a package constant of bounded depth, so the recursion
 * depth is bounded by the schema, not the candidate.
 * @param spec - one payload branch (or nested node) from {@link payloadBranches}.
 * @param value - the candidate value at this position.
 * @param path - the model-facing field path, e.g. `payload.options[2].value`.
 * @returns the normalized value plus violations; empty violations means valid.
 */
function walkSchema(spec: PayloadSchemaSpec, value: unknown, path: string): WalkResult {
  if ('oneOf' in spec) {
    const branches = spec.oneOf
    const scalarTypes = branches.map(scalarTypeOf)
    if (scalarTypes.every(type => type !== undefined)) {
      // A widened leaf: strings stay, finite numbers become strings, null (when
      // declared) stays; anything else is a pathed violation. A required
      // id/value leaf rejects the empty string (client coercedText parity);
      // the draft-field value — the only widened leaf declaring a null
      // branch — keeps it as the "generated after landing" spelling.
      const allowed = new Set(scalarTypes)
      if (typeof value === 'string' && allowed.has('string')) {
        if (value === '' && (spec as { required?: true }).required === true && !allowed.has('null')) {
          return { value, violations: [`${path} 不能为空字符串`] }
        }
        return { value, violations: [] }
      }
      if (typeof value === 'number' && Number.isFinite(value) && (allowed.has('number') || allowed.has('integer'))) {
        return { value: String(value), violations: [] }
      }
      if (value === null && allowed.has('null')) return { value, violations: [] }
      const expected = [...new Set(scalarTypes.map(type => scalarTypeName(type)))].join('或')
      return { value, violations: [`${path} 应为${expected}（收到${showValue(value)}）`] }
    }
    const branch = selectByConstDiscriminant(branches, value)
    if (branch !== undefined) return walkSchema(branch, value, path)
    // W21-R8 leniency: the two lossless action spellings — the wrapper key
    // and the missing discriminant with a unique required-field signature —
    // flatten/fill here and re-select; anything else reports the concrete
    // skeletons so one retry hits.
    const coerced = unwrapSingleKeyDiscriminant(branches, value) ?? inferMissingDiscriminant(branches, value)
    if (coerced !== undefined) {
      const selected = selectByConstDiscriminant(branches, coerced)
      if (selected !== undefined) return walkSchema(selected, coerced, path)
    }
    const kinds = discriminantValues(branches).join('/')
    const skeletons = branches
      .map(branchSkeleton)
      .filter((skeleton): skeleton is string => skeleton !== undefined)
      .join('/')
    return { value, violations: [`${path} 应为 ${kinds} 之一（判别字段缺失或无法识别，收到${showValue(value)}）；每枚形如 ${skeletons}`] }
  }
  switch (spec.type) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { value, violations: [`${path} 应为对象（收到${showValue(value)}）`] }
      }
      const source = value as Record<string, unknown>
      const result: Record<string, unknown> = {}
      const violations: string[] = []
      for (const [key, prop] of Object.entries(spec.properties ?? {})) {
        if (!Object.hasOwn(source, key)) {
          if ((prop as { required?: true }).required === true) violations.push(`${path}.${key} 缺失（必填字段）`)
          continue
        }
        // An explicit null at an optional leaf without an enum/const literal is
        // the model's "left this one out" spelling — omit it, mirroring the
        // client parser. Optional enum leaves keep rejecting null
        // (present-but-illegal), and required leaves fall through to their
        // typed violation below.
        if (source[key] === null && isNullOmissible(prop)) continue
        const child = walkSchema(prop as PayloadSchemaSpec, source[key], `${path}.${key}`)
        violations.push(...child.violations)
        result[key] = child.value
      }
      if (!spec.additionalProperties) {
        for (const key of Object.keys(source)) {
          if (!Object.hasOwn(spec.properties ?? {}, key)) {
            violations.push(`${path}.${key} 不是声明字段（本卡类型不允许额外属性）`)
          }
        }
      }
      return { value: result, violations }
    }
    case 'array': {
      if (!Array.isArray(value)) return { value, violations: [`${path} 应为数组（收到${showValue(value)}）`] }
      const items: unknown[] = []
      const violations: string[] = []
      let index = 0
      for (const entry of value) {
        const child = walkSchema(spec.items as PayloadSchemaSpec, entry, `${path}[${index}]`)
        violations.push(...child.violations)
        items.push(child.value)
        index += 1
      }
      return { value: items, violations }
    }
    case 'string':
      if (typeof value !== 'string') return { value, violations: [`${path} 应为字符串（收到${showValue(value)}）`] }
      // A required narrative leaf rejects the empty string (client
      // requiredText parity); enum/const leaves keep their literal
      // diagnostics, which already reject it.
      if (value === '' && (spec as { required?: true }).required === true && !('enum' in spec) && !('const' in spec)) {
        return { value, violations: [`${path} 不能为空字符串`] }
      }
      return checkScalarLiteral(spec, value, path)
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return { value, violations: [`${path} 应为整数（收到${showValue(value)}）`] }
      }
      return checkScalarLiteral(spec, value, path)
    case 'boolean':
      if (typeof value !== 'boolean') return { value, violations: [`${path} 应为布尔值（收到${showValue(value)}）`] }
      return checkScalarLiteral(spec, value, path)
    default:
      /* v8 ignore next -- PayloadSchemaSpec closes exactly the cases above. */
      return assertNever(spec, 'present_card leaf node')
  }
}

/** The resolved payload outcome: either a normalized payload or violations. */
export type ResolvePresentCardPayload =
  | { readonly payload: PresentCardPayload }
  | { readonly violations: readonly string[] }

/**
 * The explicit normalize-then-validate step `execute` rides (the
 * request/spec resolve convention): a string payload is JSON-parsed first (the
 * double-serialization shape old-fence contexts induce), the envelope's `v`
 * and `type` are discriminated with named diagnostics, and the selected branch
 * is walked to coerce numeric id/value/count leaves to strings and collect
 * Chinese field-pathed violations. A resolved payload behaves exactly like the
 * equivalent all-strings payload; illegal leaf types (booleans, arrays,
 * objects) stay violations.
 * @param raw - the payload argument as received (object, JSON string, or, on
 * direct invocation, anything).
 * @returns the normalized payload, or the violations to report.
 */
export function resolvePresentCardPayload(raw: unknown): ResolvePresentCardPayload {
  let candidate: unknown = raw
  if (typeof candidate === 'string') {
    const text = candidate
    try {
      candidate = JSON.parse(text)
    } catch {
      return {
        violations: [
          `payload 应为九类卡片载荷对象或其 JSON 字符串，收到的字符串无法解析为 JSON（前32字：${text.slice(0, 32)}）`,
        ],
      }
    }
  }
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return { violations: [`payload 应为九类卡片载荷对象（按 type 判别九选一），收到${showValue(candidate)}`] }
  }
  let obj = candidate as Record<string, unknown>
  const violations: string[] = []
  const typeValue = obj['type']
  if (typeof typeValue !== 'string' || !(PAYLOAD_TYPES as readonly string[]).includes(typeValue)) {
    violations.push(`payload.type 应为九类卡片类型之一：${PAYLOAD_TYPES.join('/')}（收到${showValue(typeValue)}）`)
    return { violations }
  }
  // W21-R8: a lone actions object lifts to the one-element array before the
  // walk, so its element then rides the element-level coercions above.
  if (typeValue === 'report') {
    const actions = obj['actions']
    if (typeof actions === 'object' && actions !== null && !Array.isArray(actions)) {
      obj = { ...obj, actions: [actions] }
    }
  }
  const walked = walkSchema(branchOfType(typeValue as PayloadType), obj, 'payload')
  violations.push(...walked.violations)
  if (violations.length > 0) return { violations }
  // W22-R1: the widget-bearing branches ride the deterministic resolver —
  // a validated payload leaves with its mechanically decidable widgets
  // corrected, so the model's widget choice never reaches the card where a
  // field name decides.
  return { payload: applyDeterministicWidgets(walked.value as PresentCardPayload) }
}

/** The fixed receipt text the successful result renders (model- and user-visible). */
const RESULT_TEXT = '卡片已呈现，本回合到此结束；用户的点选或确认将作为下一条用户消息到达，禁止替用户作答。'

/**
 * The non-intercepting payload declaration (W21-R2): any lossless JSON value
 * passes the framework matcher, and every payload violation is reported by
 * {@link resolvePresentCardPayload} with a Chinese field path. The nine-branch
 * table below is the model-facing guidance the old oneOf skeleton carried.
 */
const presentCardParameters = {
  payload: {
    type: 'json',
    required: true,
    description: '九类卡片载荷对象（v 恒为3，按 type 判别九选一），也可传整个载荷的 JSON 字符串（自动解析）。'
      + 'id/value/数量类叶子可直接传数字（自动转字符串）；可选的普通字段传 null 等同省略。'
      + '各类型必填字段与枚举（? 为可选）：'
      + 'ask_choice{id,mode(single/multi),variant(cards/chips/buttons),question,options[≥1]{label,value,hint?,send?},allowFreeText}；'
      + 'ask_field{id,question,field{name,label,widget(text/number/date/select/relation),unit?,suggestions{label,value,hint?}}}；'
      + 'form_draft{draftId,revision(≥1整数),form{collection,label},title,fields[≥1]{name,label,value(null 仅 tier=required),'
      + 'tier(required/derived/system),widget(同 ask_field),rationale?,edited?,options?{label,value}}}；'
      + 'submit_receipt{draftId,form,rowId,summary[≥1]{label,value,kind(money/date/id/count/text)}}；'
      + 'report{id,title,subtitle?,metrics[1-6]{label,value,kind(count/money/percent/text),tone?(positive/warning/danger)},'
      + 'rows?[≤8]{label,hint?,level(high/medium/low)},'
      + 'table?{columns[1-5]{label,kind?(text/money/percent/count)},rows[≤10 且每行=列数]},'
      + 'actions?[≤4]按钮数组，每枚是扁平对象，判别字段 kind 与其余字段同级，形如 {"kind":"view","label":"查看采购订单","route":"#/work"}；'
      + 'kind 四选一：view(需 label,route)/create-task(需 label,title，可附 suggestion)/send(需 label,text)/link(需 label,url)}；'
      + 'approval_pending{id,doc{collection,label,docId,title},summary[≥1]{label,value,kind(同 submit_receipt)},applicant?,node?,attempt?}；'
      + 'approval_result{approvalId,doc(结构同上),action(approve/reject),'
      + 'state(draft/pending/pending_level2/approved/rejected/void/potential/reviewing/qualified),by,comment?,at?}；'
      + 'plan_suggest{id,suggestionId,planType(MO/PR),product,qty,suggestDate?,driverSo?,needDate?}；'
      + 'plan_result{planId,suggestionId,planType,product,outcome(converted/dismissed),docCode?,state?,by?}',
  },
} as const

/**
 * Collect the count/cross-field bounds the schema DSL cannot express (no
 * minItems/maxItems). Each message names the offending parameter path in
 * Chinese so the model can correct and retry.
 * @param payload - the normalized (post-resolve) payload union member.
 * @returns violation messages; empty when every bound holds.
 */
function collectBoundViolations(payload: PresentCardPayload): string[] {
  const violations: string[] = []
  switch (payload.type) {
    case 'ask_choice':
      if (payload.options.length === 0) {
        violations.push('payload.options 至少1项：ask_choice 必须给出至少一个可点选项')
      }
      break
    case 'ask_field':
    case 'approval_result':
    case 'plan_suggest':
    case 'plan_result':
      // The schema alone covers these branches: no count bound applies.
      break
    case 'form_draft': {
      if (payload.revision < 1) {
        violations.push('payload.revision 必须 ≥1：草稿修订号从1开始')
      }
      if (payload.fields.length === 0) {
        violations.push('payload.fields 至少1项：form_draft 必须包含至少一个字段行')
      }
      let fieldIndex = 0
      for (const field of payload.fields) {
        if (field.value === null && field.tier !== 'required') {
          violations.push(`payload.fields[${fieldIndex}].value 为 null 仅允许 tier="required" 的字段：`
            + 'derived/system 字段的 value 必须是字符串（落库后生成的编号用空字符串 ""）')
        }
        fieldIndex += 1
      }
      break
    }
    case 'submit_receipt':
      if (payload.summary.length === 0) {
        violations.push('payload.summary 至少1项：submit_receipt 必须包含至少一行摘要')
      }
      break
    case 'report': {
      if (payload.metrics.length < 1 || payload.metrics.length > 6) {
        violations.push('payload.metrics 需1-6项：指标超上限时只保留最关键的，其余在叙述里带过')
      }
      if (payload.rows !== undefined && payload.rows.length > 8) {
        violations.push('payload.rows 最多8项：条目行超上限时只保留前8条并在叙述里注明')
      }
      const table = payload.table
      if (table !== undefined) {
        if (table.columns.length < 1 || table.columns.length > 5) {
          violations.push('payload.table.columns 需1-5列')
        }
        if (table.rows.length > 10) {
          violations.push('payload.table.rows 最多10行')
        }
        let rowIndex = 0
        for (const row of table.rows) {
          if (row.length !== table.columns.length) {
            violations.push(`payload.table.rows[${rowIndex}] 单元格数必须等于列数`)
          }
          rowIndex += 1
        }
      }
      if (payload.actions !== undefined && payload.actions.length > 4) {
        violations.push('payload.actions 最多4项')
      }
      break
    }
    case 'approval_pending':
      if (payload.summary.length === 0) {
        violations.push('payload.summary 至少1项：approval_pending 必须包含至少一行摘要')
      }
      break
    default:
      return assertNever(payload, 'payload type')
  }
  return violations
}

export function apply(ctx: Context, config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'present_card',
    description,
    parameters: presentCardParameters,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          presented: { type: 'boolean', const: true, required: true },
        },
      },
      render: () => [{ type: 'text', text: RESULT_TEXT }],
    },
    execute(args, exec) {
      const resolved = resolvePresentCardPayload(args.payload)
      if ('violations' in resolved) throw new ToolArgsError([...resolved.violations])
      const violations = [
        ...collectBoundViolations(resolved.payload),
        // W22-R1: the configured form contract (collection whitelist plus
        // the required-field floor) fails closed with its own pathed errors.
        ...enforceFormContract(resolved.payload, config.formCollections ?? {}),
      ]
      if (violations.length > 0) throw new ToolArgsError(violations)
      exec.concludeTurn()
      return Promise.resolve({ presented: true })
    },
  }))
}
