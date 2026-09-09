/**
 * Closed-set extraction tests over a fake LLM: the happy path, hallucinated
 * types degrading to the UNCLASSIFIED bucket, unknown predicates and
 * direction violations dropping with reasons, and the one feedback retry on
 * malformed output. Asserts the core guarantee: nothing outside the registry
 * is writable from a model answer.
 */

import { describe, expect, it } from 'vitest'
import { buildExtractionPrompt, extractChunk } from '../src/extract.ts'
import type { OntologyView } from '../src/extract.ts'

const VIEW: OntologyView = {
  entityTypes: [
    { id: 'company', label: '企业' },
    { id: 'product', label: '食品产品' },
    { id: 'additive', label: '食品添加剂' },
    { id: 'Concept', label: '概念' },
  ],
  relations: [
    { id: 'produces', label: '生产', constraints: [{ domain: 'company', range: 'product' }] },
    { id: 'contains', label: '含有', constraints: [{ domain: 'product', range: 'additive' }] },
    { id: 'broader', label: '广义', constraints: [] },
  ],
}

/** A fake LLM serving queued answers. */
function fakeLlm(answers: string[]): { complete: (system: string, _user: string) => Promise<string>; calls: string[] } {
  const calls: string[] = []
  let index = 0
  return {
    calls,
    complete: async (system: string, _user: string) => {
      calls.push(system)
      const answer = answers[index]
      index += 1
      if (answer === undefined) throw new Error('fake LLM exhausted')
      return answer
    },
  }
}

describe('buildExtractionPrompt', () => {
  it('lists the closed vocabulary and the output shape', () => {
    const prompt = buildExtractionPrompt(VIEW)
    expect(prompt).toContain('实体类型闭集')
    expect(prompt).toContain('- company（企业）')
    expect(prompt).toContain('- produces（生产）：company→product')
    expect(prompt).toContain('禁止发明闭集之外的类型或谓词')
  })
})

describe('extractChunk', () => {
  it('accepts a well-formed closed-set answer', async () => {
    const llm = fakeLlm([JSON.stringify({
      entities: [
        { type: 'company', name: '宏发食品' },
        { type: 'product', name: '酱油' },
        { type: 'additive', name: '山梨酸钾', evidence: '酱油含有山梨酸钾' },
      ],
      relations: [
        { subject: '宏发食品', predicate: 'produces', object: '酱油', confidence: 0.9 },
        { subject: '酱油', predicate: 'contains', object: '山梨酸钾', confidence: 0.85, evidence: '原文' },
      ],
    })])
    const outcome = await extractChunk(llm, VIEW, 'system', 'chunk text')
    expect(outcome.retried).toBe(false)
    expect(outcome.entities.map(entity => entity.name)).toEqual(['宏发食品', '酱油', '山梨酸钾'])
    expect(outcome.entities.every(entity => !entity.degraded)).toBe(true)
    expect(outcome.relations).toHaveLength(2)
    expect(outcome.dropped).toHaveLength(0)
  })

  it('degrades hallucinated entity types into the UNCLASSIFIED bucket', async () => {
    const llm = fakeLlm([JSON.stringify({
      entities: [
        { type: 'company', name: '宏发食品' },
        { type: 'weather_front', name: '冷锋' },
      ],
      relations: [],
    })])
    const outcome = await extractChunk(llm, VIEW, 'system', 'chunk')
    const bucketed = outcome.entities.find(entity => entity.name === '冷锋')
    expect(bucketed?.degraded).toBe(true)
    expect(bucketed?.claimedType).toBe('weather_front')
    expect(String(bucketed?.resolvedType)).toBe('Concept')
  })

  it('drops unknown predicates and direction violations with reasons', async () => {
    const llm = fakeLlm([JSON.stringify({
      entities: [
        { type: 'company', name: '宏发食品' },
        { type: 'additive', name: '山梨酸钾' },
      ],
      relations: [
        { subject: '宏发食品', predicate: 'cooperates_with', object: '山梨酸钾', confidence: 0.8 },
        { subject: '宏发食品', predicate: 'contains', object: '山梨酸钾', confidence: 0.8 },
      ],
    })])
    const outcome = await extractChunk(llm, VIEW, 'system', 'chunk')
    expect(outcome.relations).toHaveLength(0)
    expect(outcome.dropped.map(drop => drop.predicate)).toEqual(['cooperates_with', 'contains'])
    expect(outcome.dropped[0]?.reason).toContain('not in the closed set')
    expect(outcome.dropped[1]?.reason).toContain('company→additive')
  })

  it('retries once with feedback on malformed output and keeps the second pass', async () => {
    const llm = fakeLlm(['抱歉，我无法输出。', JSON.stringify({
      entities: [{ type: 'company', name: '宏发食品' }],
      relations: [],
    })])
    const outcome = await extractChunk(llm, VIEW, 'system', 'chunk')
    expect(outcome.retried).toBe(true)
    expect(outcome.entities).toHaveLength(1)
    expect(llm.calls[1]).toContain('上一次输出无效')
  })

  it('gives up after the retry still fails to parse', async () => {
    const llm = fakeLlm(['not json at all', 'still not json'])
    const outcome = await extractChunk(llm, VIEW, 'system', 'chunk')
    expect(outcome.retried).toBe(true)
    expect(outcome.entities).toHaveLength(0)
    expect(outcome.relations).toHaveLength(0)
  })

  it('carries props, evidence, and default confidence through happy paths', async () => {
    const llm = fakeLlm([JSON.stringify({
      entities: [
        { type: 'company', name: '宏发食品', props: { region: '香港' }, evidence: '原文第一段' },
        { type: 'product', name: '酱油' },
        { type: 'additive', name: '山梨酸钾' },
      ],
      relations: [
        { subject: '宏发食品', predicate: 'produces', object: '酱油', evidence: '宏发生产酱油' },
        { subject: '酱油', predicate: 'contains', object: '山梨酸钾' },
      ],
    })])
    const outcome = await extractChunk(llm, VIEW, 'system', 'chunk')
    expect(outcome.entities[0]?.props).toEqual({ region: '香港' })
    expect(outcome.entities[0]?.evidence).toBe('原文第一段')
    expect(outcome.relations[0]?.evidence).toBe('宏发生产酱油')
    expect(outcome.relations[1]?.confidence).toBe(0.5)
  })

  it('rejects malformed entity and relation entries at the shape layer', async () => {
    const recover = JSON.stringify({ entities: [], relations: [] })
    const badPropsVariants = await extractChunk(fakeLlm([
      JSON.stringify({ entities: [{ type: 'company', name: 'x', props: [] }], relations: [] }),
      recover,
    ]), VIEW, 'system', 'chunk')
    expect(badPropsVariants.retried).toBe(true)
    const nullProps = await extractChunk(fakeLlm([
      JSON.stringify({ entities: [{ type: 'company', name: 'x', props: null }], relations: [] }),
      recover,
    ]), VIEW, 'system', 'chunk')
    expect(nullProps.retried).toBe(true)
    const stringProps = await extractChunk(fakeLlm([
      JSON.stringify({ entities: [{ type: 'company', name: 'x', props: 'nope' }], relations: [] }),
      recover,
    ]), VIEW, 'system', 'chunk')
    expect(stringProps.retried).toBe(true)
    const relationAsNumber = await extractChunk(fakeLlm([
      JSON.stringify({ entities: [], relations: [5] }),
      recover,
    ]), VIEW, 'system', 'chunk')
    expect(relationAsNumber.retried).toBe(true)
    const relationNull = await extractChunk(fakeLlm([
      JSON.stringify({ entities: [], relations: [null] }),
      recover,
    ]), VIEW, 'system', 'chunk')
    expect(relationNull.retried).toBe(true)
  })

  it('accepts answers with absent or null collections', async () => {
    const empty = await extractChunk(fakeLlm(['{}']), VIEW, 'system', 'chunk')
    expect(empty.entities).toHaveLength(0)
    const nulls = await extractChunk(fakeLlm(['{"entities": null, "relations": null}', '{}']), VIEW, 'system', 'chunk')
    expect(nulls.retried).toBe(true)
    expect(nulls.entities).toHaveLength(0)
  })

  it('rejects malformed top-level shapes', async () => {
    const recover = JSON.stringify({ entities: [{ type: 'company', name: '宏发食品' }], relations: [] })
    const array = await extractChunk(fakeLlm(['[1,2,3]', recover]), VIEW, 'system', 'chunk')
    expect(array.retried).toBe(true)
    expect(array.entities).toHaveLength(1)
    const entitiesNotArray = await extractChunk(fakeLlm(['{"entities": 5, "relations": []}', recover]), VIEW, 'system', 'chunk')
    expect(entitiesNotArray.retried).toBe(true)
    expect(entitiesNotArray.entities).toHaveLength(1)
    const relationsNotArray = await extractChunk(fakeLlm(['{"relations": {}}', recover]), VIEW, 'system', 'chunk')
    expect(relationsNotArray.retried).toBe(true)
    const brokenJson = await extractChunk(fakeLlm(['{"entities": [}', recover]), VIEW, 'system', 'chunk')
    expect(brokenJson.retried).toBe(true)
    expect(brokenJson.entities).toHaveLength(1)
  })

  it('drops relations referencing entities the model never declared', async () => {
    const llm = fakeLlm([JSON.stringify({
      entities: [],
      relations: [{ subject: '幽灵', predicate: 'broader', object: '幻影', confidence: 0.5 }],
    })])
    const outcome = await extractChunk(llm, VIEW, 'system', 'chunk')
    expect(outcome.dropped[0]?.reason).toContain('undeclared endpoint')
  })

  it('rejects structurally malformed entries and recovers on the retry', async () => {
    const llm = fakeLlm([
      JSON.stringify({ entities: [{ type: 'company' }], relations: [] }),
      JSON.stringify({ entities: [{ type: 'company', name: '宏发食品' }], relations: [] }),
    ])
    const outcome = await extractChunk(llm, VIEW, 'system', 'chunk')
    expect(outcome.retried).toBe(true)
    expect(outcome.entities).toHaveLength(1)
  })
})
