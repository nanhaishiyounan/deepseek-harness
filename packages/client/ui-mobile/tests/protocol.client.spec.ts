// @vitest-environment jsdom
/** The v3 dsh protocol: payload validation, fence splitting, and message builders. */

import { describe, expect, it } from 'vitest'
import {
  answerTextOf,
  buildConfirmMessage,
  buildRejectMessage,
  parseDshPayload,
  splitMessage,
} from '../src/client/protocol.ts'

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
    ['ask_field suggestion not an object', '{"v":3,"type":"ask_field","id":"f","question":"q","field":{"name":"n","label":"l","widget":"text","suggestions":["x"]}}'],
    ['ask_field suggestion missing value', '{"v":3,"type":"ask_field","id":"f","question":"q","field":{"name":"n","label":"l","widget":"text","suggestions":[{"label":"l"}]}}'],
    ['form_draft field row not an object', draft('["x"]')],
    ['form_draft field missing tier', draft('[{"name":"n","label":"l","value":"1","widget":"text"}]')],
    ['form_draft fields empty', draft('[]')],
    ['form_confirm fields empty', '{"v":3,"type":"form_confirm","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"fields":[]}'],
    ['form_confirm row value not a string', '{"v":3,"type":"form_confirm","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"fields":[{"name":"n","label":"l","value":3}]}'],
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
  it('drops unusable suggestions and a missing unit without rejecting the field ask', () => {
    const noUnit = parseDshPayload('{"v":3,"type":"ask_field","id":"f","question":"q","field":{"name":"n","label":"l","widget":"text"}}')
    if (noUnit?.type !== 'ask_field') throw new Error('expected field ask')
    expect(noUnit.field.unit).toBeUndefined()
    expect(noUnit.field.suggestions).toEqual([])
    const notAList = parseDshPayload('{"v":3,"type":"ask_field","id":"f","question":"q","field":{"name":"n","label":"l","widget":"text","suggestions":"x"}}')
    if (notAList?.type !== 'ask_field') throw new Error('expected field ask')
    expect(notAList.field.suggestions).toEqual([])
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
