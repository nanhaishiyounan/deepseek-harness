import { describe, expect, it } from 'vitest'
import {
  compileShaclShapes, formatShaclFeedback, validateShaclCandidates,
} from '../src/shacl.ts'
import type { KgNodeType, KgRelation } from '../src/types.ts'
import { kgNodeTypeId, kgRelationId } from '../src/types.ts'

function nodeType(id: string, props: KgNodeType['props']): KgNodeType {
  return {
    id: kgNodeTypeId(id), label: id, layer: 'domain', props, source: 'builtin-ontology', status: 'active',
  }
}

function relation(id: string, constraints: { domain: string; range: string; cardinality?: { min?: number; max?: number } }[]): KgRelation {
  return {
    id: kgRelationId(id), label: id,
    constraints: constraints.map(pair => ({
      domain: kgNodeTypeId(pair.domain), range: kgNodeTypeId(pair.range),
      ...(pair.cardinality === undefined ? {} : { cardinality: pair.cardinality }),
    })),
    kind: 'object', source: 'builtin-ontology',
  }
}

const view = {
  nodeTypes: [
    nodeType('Product', [
      { key: 'grade', datatype: 'string', enumValues: ['A', 'B'], required: true },
      { key: 'batchNo', datatype: 'string', pattern: '^\\d{6}$' },
      { key: 'tags', datatype: 'string', isArray: true },
      { key: 'volume', datatype: 'number' },
      { key: 'madeAt', datatype: 'date' },
      { key: 'active', datatype: 'boolean' },
      { key: 'extra', datatype: 'json' },
    ]),
    nodeType('Company', []),
  ],
  relations: [
    relation('supplies', [{ domain: 'Company', range: 'Product', cardinality: { max: 1 } }]),
    relation('broader', []),
  ],
}

const shapes = compileShaclShapes(view)

describe('compileShaclShapes', () => {
  it('carries the constraint quartet into property shapes', () => {
    const shape = shapes.nodeShapes.get('Product')
    expect(shape).toBeDefined()
    const grade = shape?.props.find(prop => prop.path === 'grade')
    expect(grade?.enumValues).toEqual(['A', 'B'])
    expect(grade?.required).toBe(true)
    const tags = shape?.props.find(prop => prop.path === 'tags')
    expect(tags?.isArray).toBe(true)
    const batch = shape?.props.find(prop => prop.path === 'batchNo')
    expect(batch?.pattern).toBe('^\\d{6}$')
  })

  it('keeps unrestricted relations as empty constraint lists', () => {
    expect(shapes.relationShapes.get('broader')).toEqual([])
  })
})

describe('validateShaclCandidates', () => {
  it('accepts a conforming batch', () => {
    const report = validateShaclCandidates(shapes,
      [{ name: '宏发', typeId: 'Company' }, { name: '酱油', typeId: 'Product', props: { grade: 'A', batchNo: '202609', tags: ['a'], volume: 1, madeAt: '2026-09-01', active: true, extra: { x: 1 } } }],
      [{ relationId: 'supplies', srcName: '宏发', srcTypeId: 'Company', dstName: '酱油', dstTypeId: 'Product' }],
    )
    expect(report.conforms).toBe(true)
    expect(report.results).toEqual([])
  })

  it('flags enum, pattern, datatype, required, array, and closed violations with named components', () => {
    const report = validateShaclCandidates(shapes,
      [{
        name: '酱油', typeId: 'Product',
        props: { grade: 'X', batchNo: 'abc', tags: 'not-array', volume: 'big', madeAt: 'not-a-date', active: 1, extra: [], rogue: 'undeclared' },
      }],
      [],
    )
    const components = report.results.map(result => result.sourceConstraintComponent)
    expect(components).toContain('InConstraintComponent')
    expect(components).toContain('PatternConstraintComponent')
    expect(components).toContain('DatatypeConstraintComponent')
    expect(components).toContain('NodeKindConstraintComponent')
    expect(components).toContain('ClosedConstraintComponent')
    expect(report.results.some(result => result.path === 'grade' && result.message.includes('枚举'))).toBe(true)
  })

  it('flags a missing required property', () => {
    const report = validateShaclCandidates(shapes, [{ name: '酱油', typeId: 'Product', props: {} }], [])
    expect(report.results.some(result => result.sourceConstraintComponent === 'MinCountConstraintComponent' && result.path === 'grade')).toBe(true)
  })

  it('flags array element violations per element', () => {
    const report = validateShaclCandidates(shapes, [{ name: '酱油', typeId: 'Product', props: { grade: 'A', tags: ['ok', 7] } }], [])
    expect(report.results.some(result => result.path === 'tags' && result.sourceConstraintComponent === 'DatatypeConstraintComponent')).toBe(true)
  })

  it('flags unknown entity types and illegal relation directions', () => {
    const report = validateShaclCandidates(shapes,
      [{ name: 'X', typeId: 'Mystery' }],
      [{ relationId: 'supplies', srcName: '酱油', srcTypeId: 'Product', dstName: '宏发', dstTypeId: 'Company' }],
    )
    expect(report.results.some(result => result.sourceConstraintComponent === 'ClassConstraintComponent' && result.message.includes('Mystery'))).toBe(true)
    expect(report.results.some(result => result.focusNode.includes('supplies') && result.message.includes('不允许'))).toBe(true)
  })

  it('flags batch max-cardinality overflow for one domain instance', () => {
    const report = validateShaclCandidates(shapes, [{ name: '宏发', typeId: 'Company' }], [
      { relationId: 'supplies', srcName: '宏发', srcTypeId: 'Company', dstName: '酱油', dstTypeId: 'Product' },
      { relationId: 'supplies', srcName: '宏发', srcTypeId: 'Company', dstName: '蚝油', dstTypeId: 'Product' },
    ])
    expect(report.results.some(result => result.sourceConstraintComponent === 'MaxCountConstraintComponent')).toBe(true)
  })

  it('skips property checks for classes declaring no props', () => {
    const report = validateShaclCandidates(shapes, [{ name: '宏发', typeId: 'Company', props: { anything: 1 } }], [])
    expect(report.conforms).toBe(true)
  })

  it('accepts unrestricted-relation edges with any endpoints', () => {
    const report = validateShaclCandidates(shapes,
      [{ name: '宏发', typeId: 'Company' }, { name: '酱油', typeId: 'Product', props: { grade: 'A' } }],
      [{ relationId: 'broader', srcName: '宏发', srcTypeId: 'Company', dstName: '酱油', dstTypeId: 'Product' }],
    )
    expect(report.conforms).toBe(true)
  })
})

describe('formatShaclFeedback', () => {
  it('numbers every violation with an explanatory sentence and the hard re-output rule', () => {
    const report = validateShaclCandidates(shapes, [{ name: '酱油', typeId: 'Product', props: { grade: 'X' } }], [])
    const text = formatShaclFeedback(report)
    expect(text).toContain('仅重出被点名的条目')
    expect(text).toContain('1. 酱油 的属性 "grade"')
    expect(text).toContain('InConstraintComponent')
  })

  it('returns empty text for a conforming report', () => {
    expect(formatShaclFeedback({ conforms: true, results: [] })).toBe('')
  })
})
