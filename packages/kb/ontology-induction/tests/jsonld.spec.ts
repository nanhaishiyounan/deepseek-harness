import { describe, expect, it } from 'vitest'
import { parseOntologyJsonLd, serializeOntologyDraft } from '../src/jsonld.ts'
import type { OntologyDraft } from '../src/types.ts'

const DRAFT: OntologyDraft = {
  name: 'food-mfg',
  classes: [
    {
      id: 'company', label: '企业', description: '食品制造企业',
      props: [
        { key: 'name', datatype: 'string', required: true },
        { key: 'grade', datatype: 'string', enumValues: ['A', 'B'] },
      ],
      naturalKey: 'name', aliases: ['厂商'], evidence: '宏发食品……',
    },
    { id: 'product', label: '产品', extends: 'company', props: [{ key: 'sku', datatype: 'string', pattern: '^[A-Z]+$' }] },
  ],
  relations: [
    { id: 'produces', label: '生产', kind: 'object', constraints: [{ domain: 'company', range: 'product', cardinality: { min: 0, max: 5 } }] },
    { id: 'broaderThan', label: '宽于', kind: 'hierarchical', constraints: [{ domain: 'product', range: 'product' }, { domain: 'company', range: 'product' }] },
  ],
  corpus: [{ doc: 'a.md', chars: 10 }],
  inducedAt: '2026-10-10T00:00:00.000Z',
}

describe('serializeOntologyDraft', () => {
  it('emits @context prefixes and a sorted deterministic @graph', () => {
    const doc = serializeOntologyDraft(DRAFT)
    expect(Object.keys(doc['@context'])).toEqual(['rdf', 'rdfs', 'owl', 'sh', 'skos', 'dcterms'])
    const ids = doc['@graph'].map(node => node['@id'])
    expect([...ids].sort()).toEqual(ids)
    expect(serializeOntologyDraft(DRAFT)).toEqual(doc)
  })

  it('carries classes, shapes, and relations as RDF terms', () => {
    const doc = serializeOntologyDraft(DRAFT)
    const classNode = doc['@graph'].find(node => node['@id'].endsWith('#Class_company'))
    expect(classNode && classNode['@type']).toBe('rdfs:Class')
    expect(classNode && classNode['skos:altLabel']).toEqual(['厂商'])
    const shape = doc['@graph'].find(node => node['@id'].endsWith('#Shape_company'))
    expect(shape && shape['sh:closed']).toBe(true)
    const relation = doc['@graph'].find(node => node['@id'].endsWith('#Relation_produces'))
    expect(relation && relation['@type']).toBe('owl:ObjectProperty')
  })
})

describe('parseOntologyJsonLd (round trip)', () => {
  it('restores the model seats the serializer wrote', () => {
    const parsed = parseOntologyJsonLd(serializeOntologyDraft(DRAFT))
    expect(parsed.name).toBe('food-mfg')
    expect(parsed.inducedAt).toBe('2026-10-10T00:00:00.000Z')
    const company = parsed.classes.find(klass => klass.id === 'company')
    expect(company?.label).toBe('企业')
    expect(company?.extends).toBeUndefined()
    expect(company?.props.map(prop => prop.key)).toEqual(['name', 'grade'])
    expect(company?.naturalKey).toBe('name')
    const product = parsed.classes.find(klass => klass.id === 'product')
    expect(product?.extends).toBe('company')
    const produces = parsed.relations.find(relation => relation.id === 'produces')
    expect(produces?.constraints).toEqual([{ domain: 'company', range: 'product' }])
    const broader = parsed.relations.find(relation => relation.id === 'broaderThan')
    expect(broader?.kind).toBe('hierarchical')
    expect(broader?.constraints).toEqual([
      { domain: 'product', range: 'product' },
      { domain: 'company', range: 'product' },
    ])
  })
})
