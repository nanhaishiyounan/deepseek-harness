import { describe, expect, it } from 'vitest'
import { buildInductionPrompt, chunkCorpus, decodeCandidates, mergeCandidates, runInduction } from '../src/induction.ts'

const GOOD = JSON.stringify({
  classes: [
    { id: 'company', label: '企业', props: [{ key: 'name', datatype: 'string', required: true }], naturalKey: 'name' },
    { id: 'product', label: '产品', extends: 'company', props: [{ key: 'sku', datatype: 'string' }] },
  ],
  relations: [
    { kind: 'object', id: 'produces', label: '生产', constraints: [{ domain: 'company', range: 'product' }] },
  ],
})

describe('chunkCorpus', () => {
  it('splits long documents under the cap and keeps empty documents', () => {
    const chunks = chunkCorpus([
      { name: 'long.md', text: 'x'.repeat(15) },
      { name: 'empty.md', text: '' },
    ], 6)
    expect(chunks.map(chunk => `${chunk.doc}#${String(chunk.index)}:${String(chunk.text.length)}`)).toEqual([
      'long.md#0:6', 'long.md#1:6', 'long.md#2:3', 'empty.md#0:0',
    ])
  })
})

describe('buildInductionPrompt', () => {
  it('states the closed output contract and optional guidance', () => {
    const prompt = buildInductionPrompt('食品制造域：物料/工序/质量/供应/单据')
    expect(prompt).toContain('只输出一个 JSON 对象')
    expect(prompt).toContain('食品制造域')
    expect(buildInductionPrompt()).not.toContain('领域提示')
  })
})

describe('decodeCandidates', () => {
  it('decodes a conforming answer and skips malformed entries with notes', () => {
    const notes: string[] = []
    const decoded = decodeCandidates(`前置噪声 ${GOOD} 后置噪声`, notes)
    expect(decoded?.classes.map(klass => klass.id)).toEqual(['company', 'product'])
    expect(decoded?.relations[0]?.constraints).toEqual([{ domain: 'company', range: 'product' }])
    expect(notes).toEqual([])
    const dirty = decodeCandidates(JSON.stringify({
      classes: [{ label: '无id' }, { id: 'ok', label: '有id', props: [{ datatype: 'string' }] }],
      relations: 'not-an-array',
    }), notes)
    expect(dirty?.classes.map(klass => klass.id)).toEqual(['ok'])
    expect(dirty?.classes[0]?.props[0]?.key).toBeUndefined()
    expect(notes).toContain('skipped a class candidate without an id')
  })

  it('returns undefined for unparseable text', () => {
    expect(decodeCandidates('完全没有 JSON', [])).toBeUndefined()
    expect(decodeCandidates('{broken', [])).toBeUndefined()
  })
})

describe('mergeCandidates', () => {
  it('merges props and constraints across chunks without overwriting', () => {
    const chunks = chunkCorpus([{ name: 'a.md', text: 'xx' }], 100)
    const merged = mergeCandidates('m', chunks, [
      {
        classes: [{ id: 'company', label: '企业', props: [{ key: 'name', datatype: 'string' as const, required: true }] }],
        relations: [{ kind: 'object', id: 'produces', label: '生产', constraints: [{ domain: 'company', range: 'product' }] }],
      },
      {
        classes: [{ id: 'company', label: '公司', props: [{ key: 'taxId', datatype: 'string' as const }] }],
        relations: [{ kind: 'object', id: 'produces', label: '制造', constraints: [{ domain: 'company', range: 'product' }, { domain: 'company', range: 'material' }] }],
      },
      undefined,
    ])
    const company = merged.classes.find(klass => klass.id === 'company')
    expect(company?.label).toBe('企业')
    expect(company?.props.map(prop => prop.key)).toEqual(['name', 'taxId'])
    const produces = merged.relations.find(relation => relation.id === 'produces')
    expect(produces?.constraints).toEqual([
      { domain: 'company', range: 'product' },
      { domain: 'company', range: 'material' },
    ])
    expect(merged.corpus).toEqual([{ doc: 'a.md', chars: 2 }])
  })
})

describe('runInduction (fake LLM)', () => {
  it('chunks, extracts, gates, and records the transcript', async () => {
    const calls: { system: string; user: string }[] = []
    const result = await runInduction(
      {
        complete: async (system, user) => {
          calls.push({ system, user })
          return GOOD
        },
      },
      [
        { name: 'a.md', text: '宏发食品生产酱油。' },
        { name: 'b.md', text: '白糖由供应商供应。' },
      ],
      'food-mfg',
    )
    expect(result.report.conforms).toBe(true)
    expect(result.repairs).toBe(0)
    expect(result.transcript).toHaveLength(2)
    expect(result.transcript.every(entry => entry.kind === 'extract')).toBe(true)
    expect(result.draft.classes.map(klass => klass.id).sort()).toEqual(['company', 'product'])
    expect(calls[0]?.user).toContain('【文档：a.md（第1段）】')
  })

  it('retries malformed JSON once and repairs gate violations in a bounded loop', async () => {
    let extractCalls = 0
    let repairCalls = 0
    const badRelation = JSON.stringify({
      classes: [{ id: 'company', label: '企业', props: [{ key: 'name', datatype: 'string', required: true }], naturalKey: 'name' }],
      relations: [{ kind: 'object', id: 'produces', label: '生产', constraints: [{ domain: 'ghostDomain', range: 'company' }] }],
    })
    const result = await runInduction(
      {
        complete: async (system, _user) => {
          if (system.startsWith('你之前归纳')) {
            repairCalls += 1
            return GOOD
          }
          extractCalls += 1
          return extractCalls === 1 ? '不是 JSON' : badRelation
        },
      },
      [{ name: 'a.md', text: '一段资料。' }],
      'food-mfg',
    )
    // 1 malformed + 1 retry + 1 repair = 3 model round-trips.
    expect(extractCalls).toBe(2)
    expect(repairCalls).toBe(1)
    expect(result.repairs).toBe(1)
    expect(result.report.conforms).toBe(true)
    expect(result.transcript.map(entry => entry.kind)).toEqual(['extract', 'extract', 'repair'])
    expect(result.notes).toEqual([])
  })
})
