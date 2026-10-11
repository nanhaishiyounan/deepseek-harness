import { describe, expect, it } from 'vitest'
import { formatGateFeedback, gateOntologyDraft } from '../src/gate.ts'
import type { OntologyDraft } from '../src/types.ts'

/** A minimal conforming draft the negative cases mutate. */
const BASE: OntologyDraft = {
  name: 'food-mfg',
  classes: [
    { id: 'company', label: '企业', props: [{ key: 'name', datatype: 'string', required: true }], naturalKey: 'name' },
    { id: 'product', label: '产品', extends: 'company', props: [{ key: 'sku', datatype: 'string' }] },
  ],
  relations: [
    { kind: 'object', id: 'produces', label: '生产', constraints: [{ domain: 'company', range: 'product', cardinality: { min: 0, max: 5 } }] },
  ],
  corpus: [{ doc: 'a.md', chars: 100 }],
  inducedAt: '2026-10-10T00:00:00.000Z',
}

describe('gateOntologyDraft', () => {
  it('accepts the conforming base draft', () => {
    expect(gateOntologyDraft(BASE).conforms).toBe(true)
  })

  it('rejects an unknown relation domain with a structured violation', () => {
    const report = gateOntologyDraft({
      ...BASE,
      relations: [{ kind: 'object', id: 'produces', label: '生产', constraints: [{ domain: 'ghost', range: 'product' }] }],
    })
    expect(report.conforms).toBe(false)
    expect(report.violations).toEqual([
      { code: 'GATE_UNKNOWN_DOMAIN', focus: 'produces', path: 'constraints[0].domain', message: 'domain class "ghost" is not declared in this draft' },
    ])
  })

  it('rejects an unknown range and a self-extends parent', () => {
    const report = gateOntologyDraft({
      ...BASE,
      classes: [
        ...BASE.classes,
        { id: 'selfParent', label: '自环', extends: 'selfParent', props: [{ key: 'name', datatype: 'string' }] },
      ],
      relations: [{ kind: 'object', id: 'produces', label: '生产', constraints: [{ domain: 'company', range: 'ghost' }] }],
    })
    const codes = report.violations.map(violation => violation.code)
    expect(codes).toContain('GATE_UNKNOWN_RANGE')
    expect(codes).toContain('GATE_SELF_EXTENDS')
  })

  it('rejects extends cycles, dangling parents, duplicates, bad ids', () => {
    const report = gateOntologyDraft({
      ...BASE,
      classes: [
        ...BASE.classes,
        { id: 'a', label: 'A', extends: 'b', props: [{ key: 'name', datatype: 'string' }] },
        { id: 'b', label: 'B', extends: 'a', props: [{ key: 'name', datatype: 'string' }] },
        { id: 'dangling', label: '悬空', extends: 'nowhere', props: [] },
        { id: 'company', label: '重复', props: [] },
        { id: 'Bad_Id', label: '非法id', props: [] },
      ],
      relations: [{ kind: 'object', id: 'produces', label: '生产', constraints: [{ domain: 'a', range: 'b' }] }],
    })
    const codes = report.violations.map(violation => violation.code)
    expect(codes).toContain('GATE_PARENT_CYCLE')
    expect(codes).toContain('GATE_UNKNOWN_PARENT')
    expect(codes).toContain('GATE_DUPLICATE_CLASS')
    expect(codes).toContain('GATE_BAD_ID')
  })

  it('rejects bad natural keys, cardinalities, enums, patterns, and duplicate props', () => {
    const report = gateOntologyDraft({
      ...BASE,
      classes: [{
        id: 'company', label: '企业',
        props: [
          { key: 'name', datatype: 'string' },
          { key: 'name', datatype: 'string' },
          { key: 'grade', datatype: 'string', enumValues: [] },
          { key: 'code', datatype: 'string', pattern: '(' },
        ],
        naturalKey: 'notAProp',
      }],
      relations: [{ kind: 'object', id: 'produces', label: '生产', constraints: [{ domain: 'company', range: 'product', cardinality: { min: 5, max: 2 } }] }],
    })
    const codes = report.violations.map(violation => violation.code)
    expect(codes).toContain('GATE_BAD_NATURAL_KEY')
    expect(codes).toContain('GATE_BAD_CARDINALITY')
    expect(codes).toContain('GATE_BAD_ENUM')
    expect(codes).toContain('GATE_BAD_PATTERN')
    expect(codes).toContain('GATE_DUPLICATE_PROP')
  })

  it('rejects an empty ontology and formats feedback for the repair loop', () => {
    const empty = gateOntologyDraft({ ...BASE, classes: [] })
    expect(empty.violations.map(violation => violation.code)).toContain('GATE_EMPTY_ONTOLOGY')
    const feedback = formatGateFeedback(empty)
    expect(feedback).toContain('[GATE_EMPTY_ONTOLOGY]')
    expect(formatGateFeedback(gateOntologyDraft(BASE))).toBe('')
  })
})
