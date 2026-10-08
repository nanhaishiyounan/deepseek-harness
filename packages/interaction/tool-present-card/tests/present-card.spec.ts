import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as toolPresentCard from '@deepseek-ai/dsh-tool-present-card'
import {
  enforceFormContract,
  isLegalViewRoute,
  resolvePresentCardPayload,
  VIEW_ROUTE_CANDIDATES,
  type FormCollections,
} from '@deepseek-ai/dsh-tool-present-card'

const testToolSignal = new AbortController().signal
const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url))

/** Load one fixtures/<name>.json envelope as raw arguments data. */
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(`${fixturesDir}/${name}.json`, 'utf8'))
}

type MutableRecord = Record<string, unknown>

/** Deep-clone one fixture and apply an in-place mutation. */
function mutated(name: string, mutate: (payload: MutableRecord) => void): unknown {
  const payload = JSON.parse(JSON.stringify(fixture(name))) as MutableRecord
  mutate(payload)
  return payload
}

/** Narrow one unknown fixture member to a mutable record. */
function asRecord(value: unknown): MutableRecord {
  return value as MutableRecord
}

/** Narrow one unknown fixture member to an array of mutable records. */
function asRecords(value: unknown): MutableRecord[] {
  return value as MutableRecord[]
}

/** One element of a fixture array member, failing the test when absent. */
function recordAt(value: unknown, index: number): MutableRecord {
  const record = asRecords(value)[index]
  if (record === undefined) throw new Error(`fixture array member has no element ${String(index)}`)
  return record
}

async function setup() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(toolPresentCard)
  return ctx
}

/**
 * Mount the plugin with a `formCollections` config (the W22-R1 form-contract
 * deployment shape) so execute-level assertions see the deterministic
 * collection whitelist and required-field floor.
 */
async function setupWithFormCollections(formCollections: FormCollections) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(toolPresentCard, { formCollections })
  return ctx
}

let callSeq = 0

async function present(ctx: Context, payload: unknown) {
  callSeq += 1
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`present-card-${callSeq}`),
    name: 'present_card',
    arguments: { payload },
  })
}

const VALID_FIXTURES = [
  'ask-choice.valid',
  'ask-field.valid',
  'form-draft.valid',
  'submit-receipt.valid',
  'report.valid',
  'approval-pending.valid',
  'approval-result.valid',
  'plan-suggest.valid',
  'plan-result.valid',
  // W21-R1 leniency: numeric leaves and the stringified-payload shape.
  'ask-choice.numeric-values.valid',
  'report.numeric-cells.valid',
  'form-draft.numeric-values.valid',
  'payload-string.ask-choice.valid',
  'payload-string.numeric-values.valid',
  // W21-R2: explicit null at the optional collections means "left out".
  'report.null-optional-collections.valid',
  // W21-R3: the legal empty strings — a draft-field value and a blank cell.
  'form-draft.empty-field-value.valid',
  'report.empty-table-cell.valid',
  // W22-B2: the four draft widgets with select options in both tiers.
  'form-draft.widgets.valid',
  // W22-R1: model-declared text widgets on quantity/price/amount names ride
  // the deterministic server-side rewrite — the presented payload is legal.
  'form-draft.widget-coercion.valid',
  // W21-R8: the lossless actions spellings — wrapper key, missing kind.
  'report.actions-wrapper-key.valid',
  'report.actions-missing-kind.valid',
  'report.actions-single-object.valid',
] as const

// Structural rejections the execute-side resolve step owns: the framework
// parameter declaration never intercepts a payload (W21-R2), so each fixture
// must surface as INVALID_ARGS carrying its Chinese field path — never the
// branch-matcher "matched 0" diagnostic.
const STRUCTURAL_REJECTIONS: ReadonlyArray<{ fixture: string; fragment: string }> = [
  { fixture: 'envelope.unknown-type', fragment: 'payload.type 应为九类卡片类型之一' },
  { fixture: 'envelope.wrong-version', fragment: 'payload.v 应为 3' },
  { fixture: 'form-draft.bad-widget', fragment: 'payload.fields[1].widget 应为 "text"/"number"/"date"/"select"/"relation" 之一' },
  { fixture: 'form-draft.missing-widget.invalid', fragment: 'payload.fields[1].widget 缺失（必填字段）' },
  { fixture: 'ask-field.missing-widget.invalid', fragment: 'payload.field.widget 缺失（必填字段）' },
  // W21-R4: the client parse walk mirrors this required list exactly.
  { fixture: 'ask-field.missing-suggestions.invalid', fragment: 'payload.field.suggestions 缺失（必填字段）' },
  { fixture: 'ask-choice.boolean-value', fragment: 'payload.options[0].value 应为字符串或数字' },
  { fixture: 'report.title-number', fragment: 'payload.title 应为字符串（收到数字 5）' },
  // W21-R8: an ambiguous signature (route+title) and a bare label stay
  // violations, and the message carries the concrete skeletons.
  { fixture: 'report.actions-ambiguous.invalid', fragment: 'payload.actions[0] 应为 "view"/"create-task"/"send"/"link" 之一' },
  // W21-R3: a required scalar leaf rejects the empty string, both mirrors.
  { fixture: 'ask-choice.empty-question.invalid', fragment: 'payload.question 不能为空字符串' },
  { fixture: 'ask-choice.empty-option-label.invalid', fragment: 'payload.options[0].label 不能为空字符串' },
  { fixture: 'report.empty-metric-value.invalid', fragment: 'payload.metrics[0].value 不能为空字符串' },
  { fixture: 'plan-suggest.empty-id.invalid', fragment: 'payload.id 不能为空字符串' },
  // W22-B2: a present-but-invalid options member rejects, both mirrors.
  { fixture: 'form-draft.bad-options', fragment: 'payload.fields[0].options 应为数组（收到字符串 "net30"）' },
]

// Every execute-level bound violation pairs the fixture with the English
// parameter path its error message must name for the model to self-correct.
const BOUND_VIOLATIONS: ReadonlyArray<{ fixture: string; path: string }> = [
  { fixture: 'ask-choice.empty-options', path: 'payload.options' },
  { fixture: 'form-draft.empty-fields', path: 'payload.fields' },
  { fixture: 'form-draft.zero-revision', path: 'payload.revision' },
  { fixture: 'form-draft.null-on-derived', path: 'value' },
  { fixture: 'submit-receipt.empty-summary', path: 'payload.summary' },
  { fixture: 'approval-pending.empty-summary', path: 'payload.summary' },
  { fixture: 'report.metrics-over', path: 'payload.metrics' },
  { fixture: 'report.rows-over', path: 'payload.rows' },
  { fixture: 'report.table-columns-over', path: 'payload.table.columns' },
  { fixture: 'report.table-rows-over', path: 'payload.table.rows' },
  { fixture: 'report.table-row-width-mismatch', path: 'payload.table.rows' },
  { fixture: 'report.actions-over', path: 'payload.actions' },
]

describe('present_card tool', () => {
  it('declares a non-intercepting payload parameter (W21-R2)', async () => {
    const ctx = await setup()
    const schema = ctx.tools.schemas().find(tool => tool.name === 'present_card')

    expect(schema).toMatchObject({ name: 'present_card' })
    const payload = (schema?.parameters as { properties: { payload: Record<string, unknown> } })
      .properties.payload
    // The compiled payload node carries no type/oneOf/enum constraint: every
    // lossless JSON value passes the framework matcher and rejection is owned
    // by resolvePresentCardPayload with Chinese field paths.
    expect(Object.keys(payload).filter(key => key !== 'description')).toEqual([])
    const description = typeof payload.description === 'string' ? payload.description : ''
    for (const type of [
      'ask_choice', 'ask_field', 'form_draft', 'submit_receipt', 'report',
      'approval_pending', 'approval_result', 'plan_suggest', 'plan_result',
    ]) {
      expect(description).toContain(type)
    }

    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.tools.map(tool => tool.name)).toContain('present_card')
  })

  describe.each(VALID_FIXTURES)('%s', (name) => {
    it('presents the card, concludes the turn, and renders the fixed receipt', async () => {
      const ctx = await setup()
      const result = await present(ctx, fixture(name))

      expect(result.isError).toBe(false)
      expect(result.value).toEqual({ presented: true })
      expect(result.concludesTurn).toBe(true)
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain('禁止替用户作答')
    })
  })

  describe.each(STRUCTURAL_REJECTIONS)('$fixture', ({ fixture: name, fragment }) => {
    it('rejects with a Chinese field path as INVALID_ARGS without concluding', async () => {
      const ctx = await setup()
      const result = await present(ctx, fixture(name))

      expect(result.isError).toBe(true)
      expect(result.error).toMatchObject({ info: { code: 'INVALID_ARGS' } })
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain(fragment)
      expect(text).not.toContain('matched')
      expect(result.concludesTurn).toBeUndefined()
    })
  })

  // Every payload shape passes the json-typed parameter declaration (W21-R2),
  // so the execute-side resolve step owns these rejections — its diagnostics
  // must be Chinese and field-pathed so the model self-corrects in one retry.
  describe('string payload rejections carry Chinese field paths', () => {
    it.each([
      {
        fixture: 'payload-string.not-json',
        fragment: '收到的字符串无法解析为 JSON',
      },
      {
        fixture: 'payload-string.bad-type',
        fragment: 'payload.type 应为九类卡片类型之一',
      },
    ])('$fixture names the violation in Chinese', async ({ fixture: name, fragment }) => {
      const ctx = await setup()
      const result = await present(ctx, fixture(name))
      expect(result.isError).toBe(true)
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain(fragment)
      expect(result.concludesTurn).toBeUndefined()
    })
  })

  describe.each(BOUND_VIOLATIONS)('$fixture', ({ fixture: name, path }) => {
    it('names the offending parameter path for model self-correction', async () => {
      const ctx = await setup()
      const result = await present(ctx, fixture(name))

      expect(result.isError).toBe(true)
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain(path)
      expect(result.concludesTurn).toBeUndefined()
    })
  })

  describe('resolvePresentCardPayload normalize-then-validate step', () => {
    it('coerces numeric id/value leaves and equals the all-strings payload', () => {
      const resolved = resolvePresentCardPayload(fixture('ask-choice.numeric-values.valid'))
      expect(resolved).toEqual({
        payload: {
          v: 3,
          type: 'ask_choice',
          id: '7',
          mode: 'single',
          variant: 'chips',
          question: '向哪家供应商采购面粉？',
          options: [
            { label: '珠海鲜丰水产', value: '1' },
            { label: '鲜丰', value: '13', hint: '数字值会规范化为字符串' },
            { label: '华丰食品', value: 'hf-001' },
          ],
          allowFreeText: true,
        },
      })
    })

    it('coerces report table cells and metric values', () => {
      const resolved = resolvePresentCardPayload(fixture('report.numeric-cells.valid'))
      expect('payload' in resolved && resolved.payload.type === 'report').toBe(true)
      if (!('payload' in resolved) || resolved.payload.type !== 'report') return
      expect(resolved.payload.id).toBe('42')
      expect(resolved.payload.metrics.map(metric => metric.value)).toEqual(['15800.11', '2'])
      expect(resolved.payload.table?.rows).toEqual([['bin7', '15800.11'], ['bin87', '2']])
    })

    it('parses a stringified payload and still coerces its numeric leaves', () => {
      const resolved = resolvePresentCardPayload(fixture('payload-string.numeric-values.valid'))
      expect(resolved).toEqual({
        payload: {
          v: 3,
          type: 'ask_choice',
          id: '13',
          mode: 'single',
          variant: 'buttons',
          question: '数字与字符串混合的字符串载荷',
          options: [
            { label: 'A', value: '1' },
            { label: 'B', value: '13' },
            { label: 'C', value: 'c-3' },
          ],
          allowFreeText: false,
        },
      })
    })

    it('names the field path and expected type for a non-widened narrative leaf', () => {
      const resolved = resolvePresentCardPayload({
        ...fixture('ask-choice.valid') as Record<string, unknown>,
        question: ['不是一句话'],
      })
      expect(resolved).toEqual({
        violations: ['payload.question 应为字符串（收到数组）'],
      })
    })

    it('names the field path for an illegal boolean at a widened leaf', () => {
      const resolved = resolvePresentCardPayload(fixture('ask-choice.boolean-value'))
      expect(resolved).toEqual({
        violations: ['payload.options[0].value 应为字符串或数字（收到布尔值 true）'],
      })
    })

    it('reports undeclared properties with their paths', () => {
      const resolved = resolvePresentCardPayload({ ...fixture('ask-choice.valid') as Record<string, unknown>, extra: 1 })
      expect(resolved).toEqual({
        violations: ['payload.extra 不是声明字段（本卡类型不允许额外属性）'],
      })
    })

    it('reports missing required fields with their paths', () => {
      const resolved = resolvePresentCardPayload({ v: 3, type: 'ask_choice' })
      expect(resolved).toEqual({
        violations: [
          'payload.id 缺失（必填字段）',
          'payload.mode 缺失（必填字段）',
          'payload.variant 缺失（必填字段）',
          'payload.question 缺失（必填字段）',
          'payload.options 缺失（必填字段）',
          'payload.allowFreeText 缺失（必填字段）',
        ],
      })
    })

    it('reports enum and envelope-version violations with their paths', () => {
      const enumBad = resolvePresentCardPayload({ ...fixture('ask-choice.valid') as Record<string, unknown>, mode: 'both' })
      expect(enumBad).toEqual({
        violations: ['payload.mode 应为 "single"/"multi" 之一（收到字符串 "both"）'],
      })
      const versionBad = resolvePresentCardPayload({ ...fixture('ask-choice.valid') as Record<string, unknown>, v: 4 })
      expect(versionBad).toEqual({
        violations: ['payload.v 应为 3（收到数字 4）'],
      })
    })

    it('reports an unknown discriminator by listing the nine types', () => {
      const resolved = resolvePresentCardPayload({ v: 3, type: 'choice' })
      expect(resolved).toEqual({
        violations: [
          'payload.type 应为九类卡片类型之一：ask_choice/ask_field/form_draft/submit_receipt/report/'
            + 'approval_pending/approval_result/plan_suggest/plan_result（收到字符串 "choice"）',
        ],
      })
    })

    it('rejects a payload string that is not JSON', () => {
      const resolved = resolvePresentCardPayload(fixture('payload-string.not-json'))
      expect(resolved).toEqual({
        violations: ['payload 应为九类卡片载荷对象或其 JSON 字符串，收到的字符串无法解析为 JSON（前32字：这不是JSON{{{）'],
      })
    })

    it('rejects a payload string that parses to a non-object', () => {
      const resolved = resolvePresentCardPayload('[1,2]')
      expect(resolved).toEqual({
        violations: ['payload 应为九类卡片载荷对象（按 type 判别九选一），收到数组'],
      })
    })

    // W23-B1: the view-route shape contract — legal candidates pass, the
    // invented sub-path chains (the audit's dead route) die with the
    // candidate list so one retry hits.
    describe('view-route shape contract (W23-B1)', () => {
      it('accepts the router heads and the docs drill-down with a trailing query', () => {
        const routes = ['#/', '#/chats', '#/chat/s_1', '#/work', '#/tasks', '#/todos', '#/docs', '#/docs/pur_orders', '#/docs/pur_orders/42', '#/files', '#/agents', '#/me', '#/alerts', '#/work?collection=pur_orders&days=30']
        for (const route of routes) {
          expect(isLegalViewRoute(route), route).toBe(true)
        }
      })

      it('rejects invented heads, the two-segment work dead route, and over-deep chains', () => {
        const routes = ['#/work/business/pur_orders', '#/docs/pur_orders/42/extra', '#/work/w_1', '#/login', '#/evil', 'https://example.com', '#/alerts/todos']
        for (const route of routes) {
          expect(isLegalViewRoute(route), route).toBe(false)
        }
      })

      it('reports the route violation with its legal candidates on the resolve path', () => {
        const resolved = resolvePresentCardPayload({
          ...fixture('report.valid') as Record<string, unknown>,
          actions: [{ kind: 'view', label: '查看全部采购订单', route: '#/work/business/pur_orders' }],
        })
        expect(resolved).toEqual({
          violations: ['payload.actions[0].route "#/work/business/pur_orders" 不是合法站内路由；合法候选：' + VIEW_ROUTE_CANDIDATES],
        })
      })

      it('keeps a legal view route resolving untouched', () => {
        const resolved = resolvePresentCardPayload({
          ...fixture('report.valid') as Record<string, unknown>,
          actions: [{ kind: 'view', label: '查看采购订单', route: '#/docs/pur_orders' }],
        })
        expect('violations' in resolved).toBe(false)
      })
    })

    it('reports an unrecognizable report action kind with its skeletons to copy', () => {
      const resolved = resolvePresentCardPayload({
        ...fixture('report.valid') as Record<string, unknown>,
        actions: [{ label: '按钮', kind: 'explode' }],
      })
      expect(resolved).toEqual({
        violations: ['payload.actions[0] 应为 "view"/"create-task"/"send"/"link" 之一（判别字段缺失或无法识别，收到对象）；'
          + '每枚形如 {"kind":"view","label":"…","route":"…"}/{"kind":"create-task","label":"…","title":"…"}/'
          + '{"kind":"send","label":"…","text":"…"}/{"kind":"link","label":"…","url":"…"}'],
      })
    })

    // W21-R8: the two lossless action spellings resolve to the flat kind
    // field — an explicit illegal kind is never overridden, and an ambiguous
    // signature (route+title) stays a violation.
    describe('actions leniency (W21-R8)', () => {
      it('flattens the wrapper-key spelling to the kind field', () => {
        const resolved = resolvePresentCardPayload(fixture('report.actions-wrapper-key.valid'))
        expect(resolved).toEqual({
          payload: {
            v: 3,
            type: 'report',
            id: 'r_1',
            title: '库存查询',
            subtitle: '现有/可用/已分配',
            metrics: [
              { label: '现有数量', value: '500', kind: 'count' },
              { label: '可用数量', value: '480', kind: 'count', tone: 'positive' },
            ],
            rows: [{ label: 'SH-A-01-01', hint: '批次 LOT-01', level: 'low' }],
            table: {
              columns: [{ label: '库位', kind: 'text' }, { label: '现有', kind: 'count' }],
              rows: [['SH-A-01-01', '500']],
            },
            actions: [
              { kind: 'view', label: '查看采购订单', route: '#/work' },
              { kind: 'send', label: '查看补货建议', text: '看补货预警' },
            ],
          },
        })
      })

      it('fills a missing kind from the unique required-field signature', () => {
        const resolved = resolvePresentCardPayload(fixture('report.actions-missing-kind.valid'))
        expect('payload' in resolved && resolved.payload.type === 'report').toBe(true)
        if (!('payload' in resolved) || resolved.payload.type !== 'report') return
        expect(resolved.payload.actions).toEqual([
          { kind: 'view', label: '查看采购订单', route: '#/work' },
          { kind: 'create-task', label: '创建处理任务', title: '补货' },
        ])
      })

      it('lifts a lone actions object to the one-element array', () => {
        const resolved = resolvePresentCardPayload(fixture('report.actions-single-object.valid'))
        expect('payload' in resolved && resolved.payload.type === 'report').toBe(true)
        if (!('payload' in resolved) || resolved.payload.type !== 'report') return
        expect(resolved.payload.actions).toEqual([{ kind: 'view', label: '查看采购订单', route: '#/work' }])
      })

      it('keeps an ambiguous signature a violation with the skeletons', () => {
        const resolved = resolvePresentCardPayload(fixture('report.actions-ambiguous.invalid'))
        const skeleton = '每枚形如 {"kind":"view","label":"…","route":"…"}/{"kind":"create-task","label":"…","title":"…"}/'
          + '{"kind":"send","label":"…","text":"…"}/{"kind":"link","label":"…","url":"…"}'
        expect(resolved).toEqual({
          violations: [
            `payload.actions[0] 应为 "view"/"create-task"/"send"/"link" 之一（判别字段缺失或无法识别，收到对象）；${skeleton}`,
            `payload.actions[1] 应为 "view"/"create-task"/"send"/"link" 之一（判别字段缺失或无法识别，收到对象）；${skeleton}`,
          ],
        })
      })
    })

    it('treats explicit null at optional collections as absent', () => {
      const resolved = resolvePresentCardPayload(fixture('report.null-optional-collections.valid'))
      expect(resolved).toEqual({
        payload: {
          v: 3,
          type: 'report',
          id: 'r_null',
          title: '库存查询',
          metrics: [{ label: '现有数量', value: '500', kind: 'count' }],
        },
      })
    })

    it('still rejects a null at an optional enum leaf (present-but-illegal)', () => {
      const resolved = resolvePresentCardPayload(mutated('report.valid', (payload) => {
        recordAt(payload.metrics, 0).tone = null
      }))
      expect(resolved).toEqual({
        violations: ['payload.metrics[0].tone 应为字符串（收到null）'],
      })
    })

    // W21-R3: a required scalar leaf rejects the empty string with its field
    // path, mirroring the client's requiredText/coercedText leaves exactly.
    describe('required leaves reject the empty string (W21-R3)', () => {
      it.each([
        {
          leaf: 'ask_choice.question (narrative string)',
          run: () => fixture('ask-choice.empty-question.invalid'),
          violation: 'payload.question 不能为空字符串',
        },
        {
          leaf: 'ask_choice.options[].label (nested narrative string)',
          run: () => fixture('ask-choice.empty-option-label.invalid'),
          violation: 'payload.options[0].label 不能为空字符串',
        },
        {
          leaf: 'report.metrics[].value (widened number-text)',
          run: () => fixture('report.empty-metric-value.invalid'),
          violation: 'payload.metrics[0].value 不能为空字符串',
        },
        {
          leaf: 'plan_suggest.id (widened id)',
          run: () => fixture('plan-suggest.empty-id.invalid'),
          violation: 'payload.id 不能为空字符串',
        },
        {
          leaf: 'report.title (top-level narrative string)',
          run: () => mutated('report.valid', (payload) => { payload.title = '' }),
          violation: 'payload.title 不能为空字符串',
        },
        {
          leaf: 'approval_result.by (branch narrative string)',
          run: () => mutated('approval-result.valid', (payload) => { payload.by = '' }),
          violation: 'payload.by 不能为空字符串',
        },
      ])('$leaf', ({ run, violation }) => {
        expect(resolvePresentCardPayload(run())).toEqual({ violations: [violation] })
      })

      it('keeps the draft-field empty value (the generated-after-landing spelling)', () => {
        const resolved = resolvePresentCardPayload(fixture('form-draft.empty-field-value.valid'))
        expect('payload' in resolved && resolved.payload.type === 'form_draft').toBe(true)
        if (!('payload' in resolved) || resolved.payload.type !== 'form_draft') return
        expect(resolved.payload.fields.map(field => field.value)).toEqual(['13', ''])
      })

      it('keeps a blank report table cell', () => {
        const resolved = resolvePresentCardPayload(fixture('report.empty-table-cell.valid'))
        expect('payload' in resolved && resolved.payload.type === 'report').toBe(true)
        if (!('payload' in resolved) || resolved.payload.type !== 'report') return
        expect(resolved.payload.table?.rows).toEqual([['SH-A-01-01', '']])
      })

      it('still accepts an empty optional narrative leaf (kept, not rejected)', () => {
        const resolved = resolvePresentCardPayload(mutated('report.valid', (payload) => { payload.subtitle = '' }))
        expect('payload' in resolved && resolved.payload.type === 'report').toBe(true)
        if (!('payload' in resolved) || resolved.payload.type !== 'report') return
        expect(resolved.payload.subtitle).toBe('')
      })
    })
  })

  // W21-R2: every enum-bearing leaf reports its path plus the legal
  // candidates when the model invents a value. The num#2 seq289 shape
  // (metrics kind:"id") previously died in the framework oneOf matcher with a
  // pathless "matched 0"; the non-interception rework routes it here.
  describe('enum out-of-range diagnostics cover every enum leaf', () => {
    it.each([
      {
        leaf: 'ask_choice.variant',
        run: () => mutated('ask-choice.valid', (payload) => { payload.variant = 'list' }),
        violation: 'payload.variant 应为 "cards"/"chips"/"buttons" 之一（收到字符串 "list"）',
      },
      {
        leaf: 'ask_field.field.widget',
        run: () => mutated('ask-field.valid', (payload) => { asRecord(payload.field).widget = 'int' }),
        violation: 'payload.field.widget 应为 "text"/"number"/"date"/"select"/"relation" 之一（收到字符串 "int"）',
      },
      {
        leaf: 'form_draft.fields[].tier',
        run: () => mutated('form-draft.valid', (payload) => { recordAt(payload.fields, 0).tier = 'mandatory' }),
        violation: 'payload.fields[0].tier 应为 "required"/"derived"/"system" 之一（收到字符串 "mandatory"）',
      },
      {
        leaf: 'form_draft.fields[].widget',
        run: () => mutated('form-draft.valid', (payload) => { recordAt(payload.fields, 0).widget = 'picker' }),
        violation: 'payload.fields[0].widget 应为 "text"/"number"/"date"/"select"/"relation" 之一（收到字符串 "picker"）',
      },
      {
        leaf: 'submit_receipt.summary[].kind',
        run: () => mutated('submit-receipt.valid', (payload) => { recordAt(payload.summary, 0).kind = 'currency' }),
        violation: 'payload.summary[0].kind 应为 "money"/"date"/"id"/"count"/"text" 之一（收到字符串 "currency"）',
      },
      {
        leaf: 'report.metrics[].kind',
        run: () => mutated('report.valid', (payload) => { recordAt(payload.metrics, 0).kind = 'id' }),
        violation: 'payload.metrics[0].kind 应为 "count"/"money"/"percent"/"text" 之一（收到字符串 "id"）',
      },
      {
        leaf: 'report.metrics[].tone',
        run: () => mutated('report.valid', (payload) => { recordAt(payload.metrics, 1).tone = 'info' }),
        violation: 'payload.metrics[1].tone 应为 "positive"/"warning"/"danger" 之一（收到字符串 "info"）',
      },
      {
        leaf: 'report.rows[].level',
        run: () => mutated('report.valid', (payload) => { recordAt(payload.rows, 0).level = 'critical' }),
        violation: 'payload.rows[0].level 应为 "high"/"medium"/"low" 之一（收到字符串 "critical"）',
      },
      {
        leaf: 'report.table.columns[].kind',
        run: () => mutated('report.valid', (payload) => { recordAt(asRecord(payload.table).columns, 0).kind = 'status' }),
        violation: 'payload.table.columns[0].kind 应为 "text"/"money"/"percent"/"count" 之一（收到字符串 "status"）',
      },
      {
        leaf: 'approval_result.action',
        run: () => mutated('approval-result.valid', (payload) => { payload.action = 'ok' }),
        violation: 'payload.action 应为 "approve"/"reject" 之一（收到字符串 "ok"）',
      },
      {
        leaf: 'approval_result.state',
        run: () => mutated('approval-result.valid', (payload) => { payload.state = 'done' }),
        violation: 'payload.state 应为 "draft"/"pending"/"pending_level2"/"approved"/"rejected"/"void"/"potential"/"reviewing"/"qualified" 之一（收到字符串 "done"）',
      },
      {
        leaf: 'plan_suggest.planType',
        run: () => mutated('plan-suggest.valid', (payload) => { payload.planType = 'WO' }),
        violation: 'payload.planType 应为 "MO"/"PR" 之一（收到字符串 "WO"）',
      },
      {
        leaf: 'plan_result.outcome',
        run: () => mutated('plan-result.valid', (payload) => { payload.outcome = 'done' }),
        violation: 'payload.outcome 应为 "converted"/"dismissed" 之一（收到字符串 "done"）',
      },
    ])('$leaf', ({ run, violation }) => {
      expect(resolvePresentCardPayload(run())).toEqual({ violations: [violation] })
    })
  })

  // W22-R1: the widget kind for quantity/price/amount and date field names is
  // a server-side mechanical fact — the model's declared widget loses, and
  // only the rewritten payload reaches the card (runA run2 shape: quantity
  // text, runB run3 shape: qty labels with unit suffixes).
  describe('deterministic widget rewrite (W22-R1)', () => {
    it('rewrites model-declared text to number for quantity/unit_price/amount (runA run2 shape)', () => {
      const resolved = resolvePresentCardPayload(fixture('form-draft.widget-coercion.valid'))
      expect('payload' in resolved && resolved.payload.type === 'form_draft').toBe(true)
      if (!('payload' in resolved) || resolved.payload.type !== 'form_draft') return
      const widgets = Object.fromEntries(resolved.payload.fields.map(field => [field.name, field.widget]))
      expect(widgets).toEqual({
        supplier_id: 'relation',
        product_name: 'text',
        quantity: 'number',
        unit_price: 'number',
        amount: 'number',
        need_date: 'date',
        currency: 'text',
        code: 'text',
      })
    })

    it.each([
      { name: 'quantity', expected: 'number' },
      { name: 'qty', expected: 'number' },
      { name: 'unit_price', expected: 'number' },
      { name: 'price', expected: 'number' },
      { name: 'amount', expected: 'number' },
      { name: 'total_est', expected: 'number' },
      { name: 'std_cost', expected: 'number' },
      { name: 'estimated_cost', expected: 'number' },
      { name: 'forecast_qty', expected: 'number' },
      { name: 'lot_qty', expected: 'number' },
      { name: 'sample_qty', expected: 'number' },
      { name: 'qty_scrap', expected: 'number' },
      { name: 'defect_minor', expected: 'number' },
      { name: 'payment_amount', expected: 'number' },
      { name: 'need_date', expected: 'date' },
      { name: 'received_at', expected: 'date' },
      { name: 'issue_date', expected: 'date' },
      { name: 'inspected_at', expected: 'date' },
      { name: 'released_at', expected: 'date' },
      { name: 'expiry_date', expected: 'date' },
      { name: 'receipt_no', expected: 'text' },
      { name: 'currency', expected: 'text' },
      { name: 'doc_status', expected: 'text' },
      { name: 'sku', expected: 'text' },
    ])('$name declared text resolves to $expected', ({ name, expected }) => {
      const resolved = resolvePresentCardPayload({
        v: 3,
        type: 'form_draft',
        draftId: 'd_variant',
        revision: 1,
        form: { collection: 't_any', label: '任意表' },
        title: '变体表',
        fields: [{ name, label: '占位', value: '1', tier: 'required', widget: 'text' }],
      })
      expect('payload' in resolved && resolved.payload.type === 'form_draft').toBe(true)
      if (!('payload' in resolved) || resolved.payload.type !== 'form_draft') return
      expect(resolved.payload.fields[0]?.widget).toBe(expected)
    })

    it('matches Chinese label fragments: 入库数量（箱）label forces number (runB run3 shape)', () => {
      const resolved = resolvePresentCardPayload({
        v: 3,
        type: 'form_draft',
        draftId: 'd_label',
        revision: 1,
        form: { collection: 'wms_receipts', label: '收货单' },
        title: '收货单草稿',
        fields: [{ name: 'qty_boxes', label: '入库数量（箱）', value: '100', tier: 'required', widget: 'text' }],
      })
      expect('payload' in resolved && resolved.payload.type === 'form_draft').toBe(true)
      if (!('payload' in resolved) || resolved.payload.type !== 'form_draft') return
      expect(resolved.payload.fields[0]?.widget).toBe('number')
    })

    it('forces select for a field carrying non-empty options even when declared text', () => {
      const resolved = resolvePresentCardPayload(mutated('form-draft.widget-coercion.valid', (payload) => {
        const field = recordAt(payload.fields, 6)
        field.widget = 'text'
        field.options = [{ label: '人民币', value: 'CNY' }]
      }))
      expect('payload' in resolved && resolved.payload.type === 'form_draft').toBe(true)
      if (!('payload' in resolved) || resolved.payload.type !== 'form_draft') return
      expect(resolved.payload.fields[6]?.widget).toBe('select')
    })

    it('rewrites the ask_field branch too: quantity declared text resolves to number', () => {
      const resolved = resolvePresentCardPayload(mutated('ask-field.valid', (payload) => {
        asRecord(payload.field).name = 'quantity'
        asRecord(payload.field).widget = 'text'
      }))
      expect('payload' in resolved && resolved.payload.type === 'ask_field').toBe(true)
      if (!('payload' in resolved) || resolved.payload.type !== 'ask_field') return
      expect(resolved.payload.field.widget).toBe('number')
    })

    it('leaves every other payload branch untouched', () => {
      const resolved = resolvePresentCardPayload(fixture('report.valid'))
      expect(resolved).toEqual({ payload: fixture('report.valid') })
    })
  })

  // W22-R1: the form contract — collection whitelist plus the per-collection
  // required-field floor (fields must appear on the card; values may be
  // prefilled) — is a server-side fail-closed step the model retried into.
  describe('form contract enforcement (W22-R1)', () => {
    const FORM_COLLECTIONS = {
      pur_orders: {
        label: '采购单',
        requiredFields: [
          { names: ['supplier_id', 'supplier'], label: '供应商' },
          { names: ['product_name', 'product_id'], label: '品名' },
          { names: ['quantity', 'qty'], label: '数量' },
        ],
      },
      wms_receipts: {
        label: '收货单',
        requiredFields: [
          { names: ['po_id', 'po_no'], label: '采购订单号' },
          { names: ['qty', 'quantity'], label: '数量' },
        ],
      },
      mfg_orders: { label: '生产订单' },
    } as const

    it('accepts a pur_orders draft carrying supplier, product name, and quantity', () => {
      const resolved = resolvePresentCardPayload(fixture('form-draft.widget-coercion.valid'))
      if (!('payload' in resolved)) throw new Error('fixture must resolve')
      expect(enforceFormContract(resolved.payload, FORM_COLLECTIONS)).toEqual([])
    })

    it('rejects a pur_orders draft missing品名+数量 with one pathed error per field (runA run4 shape)', () => {
      const resolved = resolvePresentCardPayload(fixture('form-draft.contract-missing-required'))
      if (!('payload' in resolved)) throw new Error('fixture must resolve')
      expect(enforceFormContract(resolved.payload, FORM_COLLECTIONS)).toEqual([
        'payload.fields缺少必答字段 product_name/product_id（品名）——必答字段必须出现在卡片上，值可预填（value 可为 null 或预填值）',
        'payload.fields缺少必答字段 quantity/qty（数量）——必答字段必须出现在卡片上，值可预填（value 可为 null 或预填值）',
      ])
    })

    it('rejects an unregistered collection with the whitelist (runA run1 shape)', () => {
      const resolved = resolvePresentCardPayload(fixture('form-draft.contract-unknown-collection'))
      if (!('payload' in resolved)) throw new Error('fixture must resolve')
      expect(enforceFormContract(resolved.payload, FORM_COLLECTIONS)).toEqual([
        'payload.form.collection "hub_inv_products" 不在表单注册表内（合法集合：mfg_orders/pur_orders/wms_receipts）'
          + '——禁止漂移到未注册表或自造集合，请改用注册表内的表单类型重新出卡',
      ])
    })

    it('counts any synonym in a required group as present (qty satisfies 数量, product_id satisfies 品名)', () => {
      const resolved = resolvePresentCardPayload({
        v: 3,
        type: 'form_draft',
        draftId: 'd_syn',
        revision: 1,
        form: { collection: 'pur_orders', label: '采购单' },
        title: '采购单草稿',
        fields: [
          { name: 'supplier_id', label: '供应商', value: '2', tier: 'required', widget: 'relation' },
          { name: 'product_id', label: '品名', value: '46', tier: 'required', widget: 'relation' },
          { name: 'qty', label: '数量', value: '200', tier: 'required', widget: 'number' },
        ],
      })
      if (!('payload' in resolved)) throw new Error('payload must resolve')
      expect(enforceFormContract(resolved.payload, FORM_COLLECTIONS)).toEqual([])
    })

    it('skips the required-field floor for a registered collection without requiredFields', () => {
      const resolved = resolvePresentCardPayload({
        v: 3,
        type: 'form_draft',
        draftId: 'd_mfg',
        revision: 1,
        form: { collection: 'mfg_orders', label: '生产订单' },
        title: '生产订单草稿',
        fields: [{ name: 'code', label: '单号', value: '', tier: 'system', widget: 'text' }],
      })
      if (!('payload' in resolved)) throw new Error('payload must resolve')
      expect(enforceFormContract(resolved.payload, FORM_COLLECTIONS)).toEqual([])
    })

    it('returns no violations for non-form_draft payloads', () => {
      const resolved = resolvePresentCardPayload(fixture('submit-receipt.valid'))
      if (!('payload' in resolved)) throw new Error('fixture must resolve')
      expect(enforceFormContract(resolved.payload, FORM_COLLECTIONS)).toEqual([])
    })

    it('enforces nothing when no formCollections are configured (generic deployments)', () => {
      const resolved = resolvePresentCardPayload(fixture('form-draft.contract-unknown-collection'))
      if (!('payload' in resolved)) throw new Error('fixture must resolve')
      expect(enforceFormContract(resolved.payload, {})).toEqual([])
    })

    it('execute rejects the missing-required draft as INVALID_ARGS under the configured plugin', async () => {
      const ctx = await setupWithFormCollections(FORM_COLLECTIONS)
      const result = await present(ctx, fixture('form-draft.contract-missing-required'))
      expect(result.isError).toBe(true)
      expect(result.error).toMatchObject({ info: { code: 'INVALID_ARGS' } })
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain('payload.fields缺少必答字段 quantity/qty（数量）')
      expect(result.concludesTurn).toBeUndefined()
    })

    it('execute rejects the unregistered collection as INVALID_ARGS under the configured plugin', async () => {
      const ctx = await setupWithFormCollections(FORM_COLLECTIONS)
      const result = await present(ctx, fixture('form-draft.contract-unknown-collection'))
      expect(result.isError).toBe(true)
      expect(result.error).toMatchObject({ info: { code: 'INVALID_ARGS' } })
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain('payload.form.collection "hub_inv_products" 不在表单注册表内')
      expect(result.concludesTurn).toBeUndefined()
    })

    it('execute still presents the same drafts without the config (no false rejections)', async () => {
      const ctx = await setup()
      for (const name of ['form-draft.contract-missing-required', 'form-draft.contract-unknown-collection']) {
        const result = await present(ctx, fixture(name))
        expect(result.isError).toBe(false)
        expect(result.value).toEqual({ presented: true })
      }
    })
  })

  describe('framework never intercepts a payload shape (W21-R2)', () => {
    it('routes the num#2 seq289 object payload to resolve, not the oneOf matcher', async () => {
      const ctx = await setup()
      const seq289 = {
        v: 3,
        type: 'report',
        id: 'r_1',
        title: '供应商状态',
        subtitle: '编号 13 · 鲜丰',
        metrics: [
          { label: '状态', value: '合格（可下单）', kind: 'text', tone: 'positive' },
          { label: '编号', value: 'SUP-2026-0001', kind: 'id' },
        ],
      }
      const result = await present(ctx, seq289)
      expect(result.isError).toBe(true)
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain('payload.metrics[1].kind 应为 "count"/"money"/"percent"/"text" 之一（收到字符串 "id"）')
      expect(text).not.toContain('matched')
      expect(result.concludesTurn).toBeUndefined()
    })

    it('reports a scalar payload with a pathed error instead of a match failure', async () => {
      const ctx = await setup()
      const result = await present(ctx, 13)
      expect(result.isError).toBe(true)
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain('payload 应为九类卡片载荷对象（按 type 判别九选一），收到数字 13')
      expect(text).not.toContain('matched')
    })
  })

  describe('deterministic widget refinement (W22-R2)', () => {
    /** Resolve one single-field form_draft's widget, failing the test outside the branch. */
    function widgetOf(field: { name: string; label: string }): string | undefined {
      const resolved = resolvePresentCardPayload({
        v: 3,
        type: 'form_draft',
        draftId: 'd_refine',
        revision: 1,
        form: { collection: 't_any', label: '任意表' },
        title: '精化表',
        fields: [{ ...field, value: '1', tier: 'required', widget: 'text' }],
      })
      if (!('payload' in resolved) || resolved.payload.type !== 'form_draft') throw new Error('must resolve')
      return resolved.payload.fields[0]?.widget
    }

    it('pins the declared text on note-family names whose labels quote money words (customer_note 反例)', () => {
      expect(widgetOf({ name: 'customer_note', label: '客户备注（含单价上限说明）' })).toBe('text')
      expect(widgetOf({ name: 'note', label: '备注（含单价）' })).toBe('text')
      expect(widgetOf({ name: 'po_remark', label: '备注：单价历史' })).toBe('text')
      expect(widgetOf({ name: 'insp_comment', label: '检验备注' })).toBe('text')
    })

    it('keeps the compound-head label hits that motivated the fragments (no over-tightening)', () => {
      expect(widgetOf({ name: 'qty_boxes', label: '入库数量（箱）' })).toBe('number')
      expect(widgetOf({ name: 'total_all', label: '合计金额' })).toBe('number')
      expect(widgetOf({ name: 'eta', label: '交期' })).toBe('date')
      expect(widgetOf({ name: 'due', label: '需求日期' })).toBe('date')
    })

    it('treats connector-glued tokens as prose, not head words', () => {
      expect(widgetOf({ name: 'misc', label: '备注（含单价）' })).toBe('text')
      expect(widgetOf({ name: 'misc2', label: '说明：见单价表' })).toBe('text')
    })
  })

  describe('config fail-loud (W22-R2)', () => {
    it('rejects a mistyped top-level config key at startup instead of silently skipping the contract', async () => {
      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await expect(
        ctx.plugin(toolPresentCard, { formcollectionss: {} } as never),
      ).rejects.toThrow(/unknown config key "formcollectionss"/u)
    })

    it('mounts cleanly with the legal key and with no config at all', async () => {
      for (const config of [{ formCollections: {} }, undefined]) {
        const ctx = new Context()
        await ctx.plugin(SystemPrompt)
        await ctx.plugin(ToolRuntime)
        await expect(ctx.plugin(toolPresentCard, config)).resolves.toBeTypeOf('object')
      }
    })
  })
})
