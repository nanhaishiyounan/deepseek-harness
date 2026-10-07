// @vitest-environment jsdom
/** The v3 dsh protocol: payload validation, fence splitting, and message builders. */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  answerTextOf,
  buildConfirmMessage,
  buildRejectMessage,
  parseDshPayload,
  parseDshPayloadObject,
  splitMessage,
} from '../src/client/protocol.ts'

/**
 * Load one tool-present-card fixtures/<name>.json as raw payload data. The
 * corpus is the mirror source for this args-level validator — a protocol
 * change on either side must update both in one PR. The path resolves off
 * this spec file's own runner-state location (expect.getState().testPath),
 * never the process cwd; the jsdom environment rewrites import.meta.url to
 * an http URL, so the file location has to come from the runner state.
 */
function presentCardFixture(name: string): unknown {
  const testPath = expect.getState().testPath
  if (testPath === undefined) throw new Error('protocol.client.spec: runner state carries no testPath')
  const fixturesDir = join(dirname(testPath), '../../../interaction/tool-present-card/tests/fixtures')
  return JSON.parse(readFileSync(join(fixturesDir, `${name}.json`), 'utf8'))
}

describe('parseDshPayload', () => {
  it('parses a valid ask_choice with defaults for omitted presentation hints', () => {
    const payload = parseDshPayload('{"v":3,"type":"ask_choice","id":"c1","question":"登记成什么？","options":[{"label":"采购单","value":"hub_po"}]}')
    expect(payload).toEqual({
      v: 3,
      type: 'ask_choice',
      id: 'c1',
      mode: 'single',
      variant: 'chips',
      question: '登记成什么？',
      options: [{ label: '采购单', value: 'hub_po' }],
      allowFreeText: false,
    })
  })

  it('rejects a wrong version, unknown type, bad JSON, and missing required members', () => {
    expect(parseDshPayload('{"v":2,"type":"ask_choice","id":"c","question":"q","options":[]}')).toBeUndefined()
    expect(parseDshPayload('{"v":3,"type":"nonsense"}')).toBeUndefined()
    expect(parseDshPayload('not json')).toBeUndefined()
    expect(parseDshPayload('{"v":3,"type":"ask_choice","question":"无 id","options":[{"label":"a","value":"b"}]}')).toBeUndefined()
    expect(parseDshPayload('{"v":3,"type":"ask_choice","id":"c","question":"空选项","options":[]}')).toBeUndefined()
    expect(parseDshPayload('{"v":3,"type":"ask_field","id":"f","question":"q","field":{"name":"n","label":"数量","widget":"colour"}}')).toBeUndefined()
  })

  it('tolerates // comment lines inside a fence body', () => {
    const payload = parseDshPayload('{\n  // the reject anchor\n  "v":3,"type":"reject_flow","draftId":"d_1"\n}')
    expect(payload).toEqual({ v: 3, type: 'reject_flow', draftId: 'd_1' })
  })

  it('validates form_draft tiers and the null-value rule', () => {
    const draft = parseDshPayload('{"v":3,"type":"form_draft","draftId":"d_1","revision":1,"form":{"collection":"c","label":"采购单"},"title":"t","fields":[{"name":"q","label":"数量","value":null,"tier":"required","widget":"number"},{"name":"d","label":"日期","value":"2026-09-21","tier":"derived","rationale":"今天","widget":"date"}]}')
    expect(draft?.type).toBe('form_draft')
    if (draft?.type !== 'form_draft') throw new Error('unreachable')
    expect(draft.fields[0]?.value).toBeNull()
    expect(draft.fields[1]?.rationale).toBe('今天')
    // A null value on a non-required tier is a protocol violation.
    expect(parseDshPayload('{"v":3,"type":"form_draft","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"title":"t","fields":[{"name":"n","label":"l","value":null,"tier":"derived","widget":"text"}]}')).toBeUndefined()
    // A zero revision is not a re-edit anchor.
    expect(parseDshPayload('{"v":3,"type":"form_draft","draftId":"d","revision":0,"form":{"collection":"c","label":"l"},"title":"t","fields":[{"name":"n","label":"l","value":"1","tier":"required","widget":"text"}]}')).toBeUndefined()
  })

  it('validates submit_receipt summary kinds and form_confirm field rows', () => {
    expect(parseDshPayload('{"v":3,"type":"submit_receipt","draftId":"d","form":{"collection":"c","label":"l"},"rowId":"1042","summary":[{"label":"金额","value":"1","kind":"cash"}]}')).toBeUndefined()
    const confirm = parseDshPayload('{"v":3,"type":"form_confirm","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"fields":[{"name":"n","label":"数量","value":"200"}]}')
    expect(confirm?.type).toBe('form_confirm')
    expect(parseDshPayload('{"v":3,"type":"form_confirm","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"fields":[{"name":"n","label":"数量","value":null}]}')).toBeUndefined()
  })
})

describe('parseDshPayloadObject (present_card args mirror)', () => {
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
    // W21-R2: explicit null at the optional report collections is "left out".
    'report.null-optional-collections.valid',
    // W21-R3: the legal empty strings — a draft-field value and a blank cell.
    'form-draft.empty-field-value.valid',
    'report.empty-table-cell.valid',
    // W21-R8: the lossless actions spellings — wrapper key, missing kind,
    // and the lone actions object — mirror the server resolve step.
    'report.actions-wrapper-key.valid',
    'report.actions-missing-kind.valid',
    'report.actions-single-object.valid',
  ] as const

  const INVALID_FIXTURES = [
    'approval-pending.empty-summary',
    'ask-choice.boolean-value',
    'ask-choice.empty-options',
    // W21-R3: a required scalar leaf rejects the empty string, both mirrors.
    'ask-choice.empty-question.invalid',
    'ask-choice.empty-option-label.invalid',
    'ask-field.missing-widget.invalid',
    'envelope.unknown-type',
    'envelope.wrong-version',
    'form-draft.bad-widget',
    'form-draft.empty-fields',
    'form-draft.missing-widget.invalid',
    'form-draft.null-on-derived',
    'form-draft.zero-revision',
    'payload-string.bad-type',
    'payload-string.not-json',
    'plan-suggest.empty-id.invalid',
    'report.actions-over',
    // W21-R8: an ambiguous signature and a bare label stay violations.
    'report.actions-ambiguous.invalid',
    'report.empty-metric-value.invalid',
    'report.metrics-over',
    'report.rows-over',
    'report.table-columns-over',
    'report.table-row-width-mismatch',
    'report.table-rows-over',
    'report.title-number',
    'submit-receipt.empty-summary',
  ] as const

  describe.each(VALID_FIXTURES)('%s', (name) => {
    it('accepts the valid envelope and keeps its discriminant type', () => {
      const payload = parseDshPayloadObject(presentCardFixture(name))
      const expectedType = (name.split('.')[0] ?? '').replaceAll('-', '_')
      expect(payload).toBeDefined()
      expect(payload?.type).toBe(expectedType)
    })
  })

  describe.each(INVALID_FIXTURES)('%s', (name) => {
    it('rejects the invalid envelope', () => {
      expect(parseDshPayloadObject(presentCardFixture(name))).toBeUndefined()
    })
  })

  it('rejects non-object input without throwing', () => {
    expect(parseDshPayloadObject('{"v":3}')).toBeUndefined()
    expect(parseDshPayloadObject(null)).toBeUndefined()
    expect(parseDshPayloadObject(3)).toBeUndefined()
    expect(parseDshPayloadObject(['ask_choice'])).toBeUndefined()
  })

  it('agrees with the fence path on the same payload', () => {
    const raw = presentCardFixture('report.valid')
    const viaFence = parseDshPayload(JSON.stringify(raw))
    expect(parseDshPayloadObject(raw)).toEqual(viaFence)
  })

  describe('W21-R1 leniency mirrors the server-side resolve step', () => {
    it.each([
      'ask-choice.numeric-values.valid',
      'report.numeric-cells.valid',
      'form-draft.numeric-values.valid',
    ])('%s coerces numeric leaves to strings', (name) => {
      const payload = parseDshPayloadObject(presentCardFixture(name))
      expect(payload).toBeDefined()
    })

    it('coerces a numeric ask_choice exactly like the all-strings payload', () => {
      const payload = parseDshPayloadObject(presentCardFixture('ask-choice.numeric-values.valid'))
      expect(payload).toEqual({
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
      })
    })

    it('coerces report table cells and metric values', () => {
      const payload = parseDshPayloadObject(presentCardFixture('report.numeric-cells.valid'))
      if (payload?.type !== 'report') throw new Error('expected report')
      expect(payload.id).toBe('42')
      expect(payload.metrics.map(metric => metric.value)).toEqual(['15800.11', '2'])
      expect(payload.table?.rows).toEqual([['bin7', '15800.11'], ['bin87', '2']])
    })

    it('parses a stringified payload and still coerces its numeric leaves', () => {
      const viaString = parseDshPayloadObject(presentCardFixture('payload-string.numeric-values.valid'))
      expect(viaString).toEqual(parseDshPayloadObject({
        v: 3,
        type: 'ask_choice',
        id: 13,
        mode: 'single',
        variant: 'buttons',
        question: '数字与字符串混合的字符串载荷',
        options: [
          { label: 'A', value: 1 },
          { label: 'B', value: 13 },
          { label: 'C', value: 'c-3' },
        ],
        allowFreeText: false,
      }))
    })

    it('coerces numeric leaves on the fence path too, identically', () => {
      const raw = JSON.stringify(presentCardFixture('ask-choice.numeric-values.valid'))
      expect(parseDshPayload(raw)).toEqual(parseDshPayloadObject(presentCardFixture('ask-choice.numeric-values.valid')))
    })
  })

  describe('W21-R2 widget-required and null-as-absent alignment', () => {
    it('rejects a missing widget exactly like the server-side walk (ask_field)', () => {
      expect(parseDshPayloadObject(presentCardFixture('ask-field.missing-widget.invalid'))).toBeUndefined()
    })

    it('rejects a missing widget exactly like the server-side walk (form_draft)', () => {
      expect(parseDshPayloadObject(presentCardFixture('form-draft.missing-widget.invalid'))).toBeUndefined()
    })

    it('omits rows/table/actions when the model spells them null', () => {
      const payload = parseDshPayloadObject(presentCardFixture('report.null-optional-collections.valid'))
      expect(payload).toEqual({
        v: 3,
        type: 'report',
        id: 'r_null',
        title: '库存查询',
        metrics: [{ label: '现有数量', value: '500', kind: 'count' }],
      })
    })
  })

  describe('W21-R3 empty-string parity with the server-side walk', () => {
    it.each([
      'ask-choice.empty-question.invalid',
      'ask-choice.empty-option-label.invalid',
      'report.empty-metric-value.invalid',
      'plan-suggest.empty-id.invalid',
    ])('%s rejects exactly like the server-side walk', (name) => {
      expect(parseDshPayloadObject(presentCardFixture(name))).toBeUndefined()
    })

    it('keeps the draft-field empty value (the generated-after-landing spelling)', () => {
      const payload = parseDshPayloadObject(presentCardFixture('form-draft.empty-field-value.valid'))
      if (payload?.type !== 'form_draft') throw new Error('expected form_draft')
      expect(payload.fields.map(field => field.value)).toEqual(['13', ''])
    })

    it('keeps a blank report table cell', () => {
      const payload = parseDshPayloadObject(presentCardFixture('report.empty-table-cell.valid'))
      if (payload?.type !== 'report') throw new Error('expected report')
      expect(payload.table?.rows).toEqual([['SH-A-01-01', '']])
    })
  })
})

describe('splitMessage', () => {
  it('splits narrative runs and fences in source order', () => {
    const { segments, degraded } = splitMessage('前文\n```dsh\n{"v":3,"type":"reject_flow","draftId":"d"}\n```\n后文')
    expect(segments.map(segment => segment.kind)).toEqual(['text', 'dsh', 'text'])
    expect(degraded).toBe(0)
    if (segments[1]?.kind !== 'dsh') throw new Error('expected fence segment')
    expect(segments[1].payload.type).toBe('reject_flow')
  })

  it('reports an invalid fence as a degraded segment carrying its original text', () => {
    const { segments, degraded } = splitMessage('```dsh\n{oops}\n```')
    expect(degraded).toBe(1)
    if (segments[0]?.kind !== 'degraded') throw new Error('expected degraded segment')
    expect(segments[0].text).toContain('```dsh')
  })

  it('leaves ordinary json fences untouched for the v2 path', () => {
    const { segments, degraded } = splitMessage('```json\n{"collection":"c"}\n```')
    expect(degraded).toBe(0)
    if (segments[0]?.kind !== 'text') throw new Error('expected text segment')
    expect(segments[0].text).toContain('```json')
  })
})

describe('message builders', () => {
  it('answerTextOf prefers send over label', () => {
    expect(answerTextOf({ label: '采购单', value: 'v', send: '是采购单' })).toBe('是采购单')
    expect(answerTextOf({ label: '出库单', value: 'v' })).toBe('出库单')
  })

  it('builds the confirm message the fold replays as an action', () => {
    const text = buildConfirmMessage({
      v: 3,
      type: 'form_confirm',
      draftId: 'd_1',
      revision: 1,
      form: { collection: 'c', label: '采购单' },
      fields: [{ name: 'n', label: '数量', value: '200' }],
    })
    expect(text.startsWith('确认写入\n')).toBe(true)
    const parsed = parseDshPayload(text.slice(text.indexOf('```dsh') + 7, text.lastIndexOf('```')))
    expect(parsed?.type).toBe('form_confirm')
  })

  it('builds the reject message with the fence payload', () => {
    const text = buildRejectMessage({ v: 3, type: 'reject_flow', draftId: 'd_1', reason: '换一种单据' })
    expect(text.startsWith('驳回\n')).toBe(true)
    expect(text).toContain('"draftId":"d_1"')
    expect(text).toContain('"reason":"换一种单据"')
  })
})

describe('parseDshPayload select options', () => {
  it('keeps valid draft-field options and rejects malformed ones', () => {
    const withOptions = parseDshPayload('{"v":3,"type":"form_draft","draftId":"d","revision":1,"form":{"collection":"c","label":"采购单"},"title":"t","fields":[{"name":"status","label":"状态","value":"draft","tier":"derived","rationale":"默认","widget":"select","options":[{"label":"草稿","value":"draft"},{"label":"已发","value":"sent"}]}]}')
    if (withOptions?.type !== 'form_draft') throw new Error('expected draft')
    expect(withOptions.fields[0]?.options).toEqual([{ label: '草稿', value: 'draft' }, { label: '已发', value: 'sent' }])
    // Malformed options degrade to no candidates rather than rejecting the field.
    const dropped = parseDshPayload('{"v":3,"type":"form_draft","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"title":"t","fields":[{"name":"s","label":"状态","value":"draft","tier":"derived","widget":"select","options":[{"label":"只有标签"}]}]}')
    if (dropped?.type !== 'form_draft') throw new Error('expected draft')
    expect(dropped.fields[0]?.options).toBeUndefined()
    const notAList = parseDshPayload('{"v":3,"type":"form_draft","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"title":"t","fields":[{"name":"s","label":"状态","value":"draft","tier":"derived","widget":"select","options":"not-a-list"}]}')
    if (notAList?.type !== 'form_draft') throw new Error('expected draft')
    expect(notAList.fields[0]?.options).toBeUndefined()
  })
})

describe('parseDshPayload rejection matrix (model-output boundary)', () => {
  const draft = (fields: string): string =>
    `{"v":3,"type":"form_draft","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"title":"t","fields":${fields}}`

  it.each([
    ['ask_choice without options', '{"v":3,"type":"ask_choice","id":"c","question":"q"}'],
    ['ask_choice with a non-object option', '{"v":3,"type":"ask_choice","id":"c","question":"q","options":["x"]}'],
    ['ask_choice option missing label', '{"v":3,"type":"ask_choice","id":"c","question":"q","options":[{"value":"v"}]}'],
    ['ask_choice option missing value', '{"v":3,"type":"ask_choice","id":"c","question":"q","options":[{"label":"l"}]}'],
    ['ask_field without field', '{"v":3,"type":"ask_field","id":"f","question":"q"}'],
    ['ask_field field not an object', '{"v":3,"type":"ask_field","id":"f","question":"q","field":"x"}'],
    // W21-R4: the server schema marks field.suggestions required; the mirror
    // fixture is ask-field.missing-suggestions.invalid.
    ['ask_field missing suggestions', '{"v":3,"type":"ask_field","id":"f","question":"q","field":{"name":"n","label":"l","widget":"text"}}'],
    ['ask_field suggestions not a list', '{"v":3,"type":"ask_field","id":"f","question":"q","field":{"name":"n","label":"l","widget":"text","suggestions":"x"}}'],
    ['ask_field suggestion not an object', '{"v":3,"type":"ask_field","id":"f","question":"q","field":{"name":"n","label":"l","widget":"text","suggestions":["x"]}}'],
    ['ask_field suggestion missing value', '{"v":3,"type":"ask_field","id":"f","question":"q","field":{"name":"n","label":"l","widget":"text","suggestions":[{"label":"l"}]}}'],
    ['form_draft field row not an object', draft('["x"]')],
    ['form_draft field missing tier', draft('[{"name":"n","label":"l","value":"1","widget":"text"}]')],
    ['form_draft fields empty', draft('[]')],
    ['form_confirm fields empty', '{"v":3,"type":"form_confirm","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"fields":[]}'],
    // W21-R1: a numeric row value now coerces to its string form; a boolean
    // stays a rejection.
    ['form_confirm row value neither string nor number', '{"v":3,"type":"form_confirm","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"fields":[{"name":"n","label":"l","value":true}]}'],
    ['submit_receipt without rowId', '{"v":3,"type":"submit_receipt","draftId":"d","form":{"collection":"c","label":"l"},"summary":[{"label":"l","value":"v","kind":"text"}]}'],
    ['submit_receipt summary not a list', '{"v":3,"type":"submit_receipt","draftId":"d","form":{"collection":"c","label":"l"},"rowId":"1","summary":"x"}'],
    ['submit_receipt summary row not an object', '{"v":3,"type":"submit_receipt","draftId":"d","form":{"collection":"c","label":"l"},"rowId":"1","summary":["x"]}'],
    ['a non-object body', '"just a string"'],
  ])('rejects %s', (_label, body) => {
    expect(parseDshPayload(body)).toBeUndefined()
  })

  it('keeps the optional presence arms (hint, unit, reason, edited, options)', () => {
    const ask = parseDshPayload('{"v":3,"type":"ask_choice","id":"c","question":"q","options":[{"label":"l","value":"v","hint":"h","send":"s"}]}')
    if (ask?.type !== 'ask_choice') throw new Error('expected ask')
    expect(ask.options[0]).toEqual({ label: 'l', value: 'v', hint: 'h', send: 's' })

    const field = parseDshPayload('{"v":3,"type":"ask_field","id":"f","question":"q","field":{"name":"n","label":"l","widget":"number","unit":"箱","suggestions":[{"label":"l","value":"v","hint":"h"}]}}')
    if (field?.type !== 'ask_field') throw new Error('expected field ask')
    expect(field.field.unit).toBe('箱')
    expect(field.field.suggestions[0]?.hint).toBe('h')

    const reject = parseDshPayload('{"v":3,"type":"reject_flow","draftId":"d","reason":"换一种单据"}')
    if (reject?.type !== 'reject_flow') throw new Error('expected reject')
    expect(reject.reason).toBe('换一种单据')

    const edited = parseDshPayload(draft('[{"name":"n","label":"l","value":"1","tier":"required","widget":"text","edited":true,"rationale":"r"}]'))
    if (edited?.type !== 'form_draft') throw new Error('expected draft')
    expect(edited.fields[0]?.edited).toBe(true)
    expect(edited.fields[0]?.rationale).toBe('r')
  })

  it('splits fences with blank runs, missing tails, and non-newline tags', () => {
    // Blank narrative runs between fences collapse away.
    const { segments } = splitMessage('```dsh\n{"v":3,"type":"reject_flow","draftId":"a"}\n```\n\n```dsh\n{"v":3,"type":"reject_flow","draftId":"b"}\n```')
    expect(segments).toHaveLength(2)
    // A dsh tag without the newline is not a fence.
    const loose = splitMessage('```dsh {"v":3}')
    expect(loose.segments[0]?.kind).toBe('text')
    expect(loose.degraded).toBe(0)
  })
})

describe('parseDshPayload remaining condition arms', () => {
  it.each([
    ['ask_choice without id', '{"v":3,"type":"ask_choice","question":"q","options":[{"label":"l","value":"v"}]}'],
    ['ask_choice without question', '{"v":3,"type":"ask_choice","id":"c","options":[{"label":"l","value":"v"}]}'],
    ['form_draft field without label', '{"v":3,"type":"form_draft","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"title":"t","fields":[{"name":"n","value":"1","tier":"required","widget":"text"}]}'],
    ['form_draft without title', '{"v":3,"type":"form_draft","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"fields":[{"name":"n","label":"l","value":"1","tier":"required","widget":"text"}]}'],
    ['form_draft without form', '{"v":3,"type":"form_draft","draftId":"d","revision":1,"title":"t","fields":[{"name":"n","label":"l","value":"1","tier":"required","widget":"text"}]}'],
    ['form_confirm without form', '{"v":3,"type":"form_confirm","draftId":"d","revision":1,"fields":[{"name":"n","label":"l","value":"1"}]}'],
    ['form_confirm with a fractional revision', '{"v":3,"type":"form_confirm","draftId":"d","revision":1.5,"form":{"collection":"c","label":"l"},"fields":[{"name":"n","label":"l","value":"1"}]}'],
    ['submit_receipt summary without label', '{"v":3,"type":"submit_receipt","draftId":"d","form":{"collection":"c","label":"l"},"rowId":"1","summary":[{"value":"v","kind":"text"}]}'],
    ['submit_receipt summary without value', '{"v":3,"type":"submit_receipt","draftId":"d","form":{"collection":"c","label":"l"},"rowId":"1","summary":[{"label":"l","kind":"text"}]}'],
    ['reject_flow without draftId', '{"v":3,"type":"reject_flow"}'],
  ])('rejects %s', (_label, body) => {
    expect(parseDshPayload(body)).toBeUndefined()
  })

  it('trims a blank hint away from an ask option', () => {
    const parsed = parseDshPayload('{"v":3,"type":"ask_choice","id":"c","question":"q","options":[{"label":"l","value":"v","hint":"   "}]}')
    if (parsed?.type !== 'ask_choice') throw new Error('expected ask')
    expect(parsed.options[0]?.hint).toBeUndefined()
  })
})

describe('parseDshPayload middle-arm and lenient arms', () => {
  it('keeps a missing unit but rejects a field ask without a suggestions list (W21-R4)', () => {
    const noUnit = parseDshPayload('{"v":3,"type":"ask_field","id":"f","question":"q","field":{"name":"n","label":"l","widget":"text","suggestions":[]}}')
    if (noUnit?.type !== 'ask_field') throw new Error('expected field ask')
    expect(noUnit.field.unit).toBeUndefined()
    expect(parseDshPayload('{"v":3,"type":"ask_field","id":"f","question":"q","field":{"name":"n","label":"l","widget":"text"}}')).toBeUndefined()
    expect(parseDshPayload('{"v":3,"type":"ask_field","id":"f","question":"q","field":{"name":"n","label":"l","widget":"text","suggestions":"x"}}')).toBeUndefined()
  })

  it('rejects a draft field without a name and a receipt without a draftId', () => {
    expect(parseDshPayload('{"v":3,"type":"form_draft","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"title":"t","fields":[{"label":"l","value":"1","tier":"required","widget":"text"}]}')).toBeUndefined()
    expect(parseDshPayload('{"v":3,"type":"submit_receipt","form":{"collection":"c","label":"l"},"rowId":"1","summary":[{"label":"l","value":"v","kind":"text"}]}')).toBeUndefined()
  })
})

describe('parseDshPayload draftId and revision arms', () => {
  it('rejects drafts without a draftId and with a non-numeric revision', () => {
    expect(parseDshPayload('{"v":3,"type":"form_draft","revision":1,"form":{"collection":"c","label":"l"},"title":"t","fields":[{"name":"n","label":"l","value":"1","tier":"required","widget":"text"}]}')).toBeUndefined()
    expect(parseDshPayload('{"v":3,"type":"form_draft","draftId":"d","revision":"1","form":{"collection":"c","label":"l"},"title":"t","fields":[{"name":"n","label":"l","value":"1","tier":"required","widget":"text"}]}')).toBeUndefined()
  })
})

describe('parseDshPayload first-condition short-circuits', () => {
  it('rejects an ask_field without id, a draft without draftId, and a confirm without draftId', () => {
    expect(parseDshPayload('{"v":3,"type":"ask_field","question":"q","field":{"name":"n","label":"l","widget":"text"}}')).toBeUndefined()
    expect(parseDshPayload('{"v":3,"type":"form_draft","revision":1,"form":{"collection":"c","label":"l"},"title":"t","fields":[{"name":"n","label":"l","value":"1","tier":"required","widget":"text"}]}')).toBeUndefined()
    expect(parseDshPayload('{"v":3,"type":"form_confirm","revision":1,"form":{"collection":"c","label":"l"},"fields":[{"name":"n","label":"l","value":"1"}]}')).toBeUndefined()
  })
})

describe('parseDshPayload remaining first-condition arms', () => {
  it('drops non-object option elements and rejects a form without a collection', () => {
    const dropped = parseDshPayload('{"v":3,"type":"form_draft","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"title":"t","fields":[{"name":"s","label":"状态","value":"draft","tier":"derived","widget":"select","options":["x"]}]}')
    if (dropped?.type !== 'form_draft') throw new Error('expected draft')
    expect(dropped.fields[0]?.options).toBeUndefined()
    expect(parseDshPayload('{"v":3,"type":"form_confirm","draftId":"d","revision":1,"form":{"label":"采购单"},"fields":[{"name":"n","label":"l","value":"1"}]}')).toBeUndefined()
  })
})

describe('parseDshPayload report payloads', () => {
  /** One minimal legal report body with every optional member present. */
  const fullReport = '{"v":3,"type":"report","id":"r_1","title":"项目风险","subtitle":"截至今天 · 数据来自湖仓指标",'
    + '"metrics":[{"label":"待处理","value":"5","kind":"count","tone":"warning"},{"label":"采购额","value":"¥16,000","kind":"money"}],'
    + '"rows":[{"label":"接口联调延期","hint":"影响测试开始 1～2 天","level":"high"},{"label":"文档滞后","level":"low"}],'
    + '"table":{"columns":[{"label":"风险"},{"label":"影响","kind":"percent"}],"rows":[["接口联调延期","40%"]]},'
    + '"actions":[{"kind":"create-task","label":"创建处理任务","title":"接口联调延期处理","suggestion":"今天与技术负责人确认新联调时间"},'
    + '{"kind":"view","label":"查看工作","route":"#/work"},{"kind":"send","label":"追问影响","text":"对联调的具体影响再展开说说"},'
    + '{"kind":"link","label":"相关文档","url":"https://example.com/doc"}]}'

  /** One minimal legal body with extra JSON members appended before the closing brace. */
  const report = (extra: string): string =>
    `{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}]${extra}}`
  const lowRows = (count: number): string =>
    Array.from({ length: count }, (_, i) => `{"label":"r${String(i)}","level":"low"}`).join(',')
  const plainColumns = (count: number): string => Array.from({ length: count }, () => '{"label":"列"}').join(',')
  const cellRows = (count: number, width: number): string =>
    Array.from({ length: count }, () => JSON.stringify(Array.from({ length: width }, () => 'a'))).join(',')
  const sendActions = (count: number): string =>
    Array.from({ length: count }, () => '{"kind":"send","label":"问","text":"追问"}').join(',')

  it('parses the full legal report into the DshPayload union', () => {
    const payload = parseDshPayload(fullReport)
    expect(payload?.type).toBe('report')
    if (payload?.type !== 'report') throw new Error('expected report')
    expect(payload.title).toBe('项目风险')
    expect(payload.subtitle).toBe('截至今天 · 数据来自湖仓指标')
    expect(payload.metrics).toHaveLength(2)
    expect(payload.metrics[0]).toEqual({ label: '待处理', value: '5', kind: 'count', tone: 'warning' })
    expect(payload.metrics[1]?.tone).toBeUndefined()
    expect(payload.rows?.[0]).toEqual({ label: '接口联调延期', hint: '影响测试开始 1～2 天', level: 'high' })
    expect(payload.rows?.[1]?.hint).toBeUndefined()
    expect(payload.table?.columns[1]).toEqual({ label: '影响', kind: 'percent' })
    expect(payload.actions?.[0]).toEqual({ kind: 'create-task', label: '创建处理任务', title: '接口联调延期处理', suggestion: '今天与技术负责人确认新联调时间' })
  })

  it('parses the minimal report (metrics only) and trims a blank subtitle away', () => {
    const minimal = parseDshPayload('{"v":3,"type":"report","id":"r_2","title":"本月经营概览","metrics":[{"label":"交付率","value":"96%","kind":"percent"}]}')
    if (minimal?.type !== 'report') throw new Error('expected report')
    expect(minimal.rows).toBeUndefined()
    expect(minimal.table).toBeUndefined()
    expect(minimal.actions).toBeUndefined()
    const trimmed = parseDshPayload('{"v":3,"type":"report","id":"r_3","title":"t","subtitle":"   ","metrics":[{"label":"a","value":"1","kind":"text"}]}')
    if (trimmed?.type !== 'report') throw new Error('expected report')
    expect(trimmed.subtitle).toBeUndefined()
  })

  // The B2 real-LLM capture form: the model writes the follow-up instruction
  // into `text` instead of `title` (hasTitle:false / hasText:true across two
  // independent business-advisor sessions). The parser folds it back onto the
  // legal title+suggestion shape instead of degrading the whole card.
  it('folds a text-only create-task action onto title+suggestion (real capture form)', () => {
    const longText = '针对两家供应商资质证照三十天内到期的风险，联系临期供应商确认换发材料清单并跟进出证进度'
    const payload = parseDshPayload(`{"v":3,"type":"report","id":"r_live","title":"供应商风险","metrics":[{"label":"临期资质","value":"2","kind":"count","tone":"warning"}],"actions":[{"kind":"create-task","label":"创建处理任务","text":"${longText}"}]}`)
    if (payload?.type !== 'report') throw new Error('expected report')
    expect(payload.actions?.[0]).toEqual({
      kind: 'create-task',
      label: '创建处理任务',
      title: Array.from(longText).slice(0, 32).join(''),
      suggestion: longText,
    })
  })

  it('keeps an explicit create-task title and lets text stand in for the suggestion', () => {
    const payload = parseDshPayload('{"v":3,"type":"report","id":"r_live2","title":"项目风险","metrics":[{"label":"a","value":"1","kind":"text"}],"actions":[{"kind":"create-task","label":"创建处理任务","title":"接口联调延期处理","text":"今天与技术负责人确认新联调时间"},{"kind":"create-task","label":"再次创建","title":"带建议","text":"被建议覆盖","suggestion":"显式建议优先"}]}')
    if (payload?.type !== 'report') throw new Error('expected report')
    expect(payload.actions?.[0]).toEqual({ kind: 'create-task', label: '创建处理任务', title: '接口联调延期处理', suggestion: '今天与技术负责人确认新联调时间' })
    expect(payload.actions?.[1]).toEqual({ kind: 'create-task', label: '再次创建', title: '带建议', suggestion: '显式建议优先' })
  })

  it('treats an explicit null table/rows as absent (the real capture writes "table": null)', () => {
    const payload = parseDshPayload('{"v":3,"type":"report","id":"r_null","title":"当前项目风险概览","metrics":[{"label":"出口负增长品类","value":"3 项","kind":"count","tone":"danger"}],"rows":null,"table":null,"actions":[{"kind":"create-task","label":"创建油脂锁价任务","title":"跟进棕榈油/大豆油锁价","suggestion":"漯河油脂高位，建议协商远期锁价"},{"kind":"send","label":"油脂原料近半年走势","text":"看棕榈油近 6 个月双市场价走势"}]}')
    if (payload?.type !== 'report') throw new Error('expected report')
    expect(payload.rows).toBeUndefined()
    expect(payload.table).toBeUndefined()
    expect(payload.actions).toHaveLength(2)
    expect(payload.actions?.[0]).toEqual({ kind: 'create-task', label: '创建油脂锁价任务', title: '跟进棕榈油/大豆油锁价', suggestion: '漯河油脂高位，建议协商远期锁价' })
  })

  it('still rejects a create-task action whose text is blank (neither title nor text)', () => {
    expect(parseDshPayload('{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"actions":[{"kind":"create-task","label":"建","text":"   "}]}')).toBeUndefined()
  })
  it('accepts the exact ceilings: 6 metrics, 8 rows, 5 columns × 10 rows, 4 actions', () => {
    const metrics = Array.from({ length: 6 }, (_, i) => `{"label":"m${String(i)}","value":"1","kind":"text"}`).join(',')
    const rows = Array.from({ length: 8 }, (_, i) => `{"label":"r${String(i)}","level":"low"}`).join(',')
    const columns = Array.from({ length: 5 }, () => '{"label":"列"}').join(',')
    const tableRows = Array.from({ length: 10 }, () => '["a","b","c","d","e"]').join(',')
    const actions = Array.from({ length: 4 }, () => '{"kind":"send","label":"问","text":"追问"}').join(',')
    const atCeiling = parseDshPayload(`{"v":3,"type":"report","id":"r_4","title":"上限","metrics":[${metrics}],`
      + `"rows":[${rows}],"table":{"columns":[${columns}],"rows":[${tableRows}]},"actions":[${actions}]}`)
    if (atCeiling?.type !== 'report') throw new Error('expected report')
    expect(atCeiling.metrics).toHaveLength(6)
    expect(atCeiling.rows).toHaveLength(8)
    expect(atCeiling.table?.columns).toHaveLength(5)
    expect(atCeiling.table?.rows).toHaveLength(10)
    expect(atCeiling.actions).toHaveLength(4)
  })

  it('rejects a non-array metrics and the 0/7 metric bounds', () => {
    expect(parseDshPayload('{"v":3,"type":"report","id":"r","title":"t","metrics":{"label":"a"}}')).toBeUndefined()
    expect(parseDshPayload('{"v":3,"type":"report","id":"r","title":"t","metrics":[]}')).toBeUndefined()
    const seven = Array.from({ length: 7 }, (_, i) => `{"label":"m${String(i)}","value":"1","kind":"text"}`).join(',')
    expect(parseDshPayload(`{"v":3,"type":"report","id":"r","title":"t","metrics":[${seven}]}`)).toBeUndefined()
  })

  it.each([
    ['without id', '{"v":3,"type":"report","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}]}'],
    ['without title', '{"v":3,"type":"report","id":"r","metrics":[{"label":"a","value":"1","kind":"text"}]}'],
    ['metric missing label', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"value":"1","kind":"text"}]}'],
    ['metric missing value', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","kind":"text"}]}'],
    ['metric with an illegal kind', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"date"}]}'],
    ['metric with an illegal tone', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text","tone":"info"}]}'],
    ['metric row not an object', '{"v":3,"type":"report","id":"r","title":"t","metrics":["x"]}'],
    ['nine rows', report(`,"rows":[${lowRows(9)}]`)],
    ['row with an illegal level', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"rows":[{"label":"x","level":"critical"}]}'],
    ['row not an object', report(',"rows":["x"]')],
    ['table column not an object', report(',"table":{"columns":["x"],"rows":[]}')],
    ['action not an object', report(',"actions":["x"]')],
    ['rows not an array', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"rows":"x"}'],
    ['table not an object', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"table":"x"}'],
    ['table with six columns', report(`,"table":{"columns":[${plainColumns(6)}],"rows":[]}`)],
    ['table with eleven rows', report(`,"table":{"columns":[{"label":"列"}],"rows":[${cellRows(11, 1)}]}`)],
    ['table row wider than the columns', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"table":{"columns":[{"label":"列"}],"rows":[["a","b"]]}}'],
    // W21-R1: a numeric cell now coerces to its string form; a boolean cell
    // stays a rejection.
    ['table with a cell neither string nor number', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"table":{"columns":[{"label":"列"}],"rows":[[true]]}}'],
    ['table column without a label', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"table":{"columns":[{"kind":"money"}],"rows":[["1"]]}}'],
    ['table column with an illegal kind', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"table":{"columns":[{"label":"列","kind":"date"}],"rows":[["1"]]}}'],
    ['five actions', report(`,"actions":[${sendActions(5)}]`)],
    ['view action without a route', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"actions":[{"kind":"view","label":"看"}]}'],
    ['create-task action without a title', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"actions":[{"kind":"create-task","label":"建"}]}'],
    ['send action without a text', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"actions":[{"kind":"send","label":"问"}]}'],
    ['link action without a url', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"actions":[{"kind":"link","label":"链"}]}'],
    ['action without a label', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"actions":[{"kind":"send","text":"追问"}]}'],
    ['action with an unknown kind', '{"v":3,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}],"actions":[{"kind":"delete","label":"删"}]}'],
    ['a wrong envelope version', '{"v":5,"type":"report","id":"r","title":"t","metrics":[{"label":"a","value":"1","kind":"text"}]}'],
  ])('rejects %s', (_label, body) => {
    expect(parseDshPayload(body)).toBeUndefined()
  })

  it('degrades an over-limit report fence to the collapsed notice path', () => {
    const { segments, degraded } = splitMessage('```dsh\n{"v":3,"type":"report","id":"r","title":"超限","metrics":[]}\n```')
    expect(degraded).toBe(1)
    if (segments[0]?.kind !== 'degraded') throw new Error('expected degraded segment')
    expect(segments[0].text).toContain('"type":"report"')
  })
})
