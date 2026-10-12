import { describe, expect, it } from 'vitest'
import { formatGraphQueryOutput, graphQueryValueFromRows, parseGraphQueryArgs } from '../src/graph-query.ts'
import { formatOntologyOutput, ontologyValueFromVersions } from '../src/ontology.ts'

describe('parseGraphQueryArgs', () => {
  it('rejects blank Cypher and defaults params', () => {
    expect(() => { parseGraphQueryArgs({ cypher: '   ' }) }).toThrow('non-empty string')
    expect(parseGraphQueryArgs({ cypher: ' MATCH (n) RETURN n ' })).toEqual({ cypher: 'MATCH (n) RETURN n' })
  })
})

describe('graphQueryValueFromRows', () => {
  it('projects rows with scalar cells and JSON text for nested values', () => {
    const value = graphQueryValueFromRows(
      { cypher: 'MATCH (n) RETURN n.name AS name, n.props AS props' },
      [
        { name: '酱油', props: { a: 1 } },
        { name: null, props: undefined },
      ],
      500,
    )
    expect(value.columns).toEqual(['name', 'props'])
    expect(value.rows[0]).toEqual(['酱油', '{"a":1}'])
    expect(value.rows[1]).toEqual([null, null])
    expect(value.truncated).toBe(false)
    expect(graphQueryValueFromRows({ cypher: 'x' }, Array.from({ length: 10 }, () => ({ a: 1 })), 10).truncated).toBe(true)
  })

  it('renders the markdown table with attribution and answer guidance', () => {
    const text = formatGraphQueryOutput(graphQueryValueFromRows(
      { cypher: 'MATCH (n) RETURN n.name AS name' },
      [{ name: '白糖' }],
      500,
    ))
    expect(text).toContain('| name |')
    expect(text).toContain('| 白糖 |')
    expect(text).toContain('Data source: Neo4j graph (kg_graph_query)')
    expect(text).toContain('name the node types and relations')
    expect(formatGraphQueryOutput(graphQueryValueFromRows({ cypher: 'x' }, [], 500))).toContain('(0 rows returned)')
  })
})

describe('ontologyValueFromVersions', () => {
  it('carries the chain and parses the head census from its JSON-LD payload', () => {
    const value = ontologyValueFromVersions(
      [
        { id: 'v2', version: 2, name: 'food-mfg', source: 'llm-induction', createdAt: '2026-10-10T01:00:00.000Z', prev: 'v1' },
        { id: 'v1', version: 1, name: 'food-mfg', source: 'seed', createdAt: '2026-10-09T01:00:00.000Z' },
      ],
      {
        '@context': {},
        '@graph': [
          { '@id': 'https://dsh.local/ontology/food-mfg#Class_company', '@type': 'rdfs:Class' },
          { '@id': 'https://dsh.local/ontology/food-mfg#Relation_produces', '@type': 'owl:ObjectProperty' },
          { '@id': 'https://dsh.local/ontology/food-mfg', '@type': 'owl:Ontology' },
        ],
      },
    )
    expect(value.versions).toHaveLength(2)
    expect(value.versions[0]?.prev).toBe('v1')
    expect(value.head?.classes).toEqual(['company'])
    expect(value.head?.relations).toEqual(['produces'])
  })

  it('renders the version table and census line', () => {
    const text = formatOntologyOutput(ontologyValueFromVersions([], undefined))
    expect(text).toContain('(no ontology version stored yet)')
    const withHead = formatOntologyOutput(ontologyValueFromVersions(
      [{ id: 'v1', version: 1, name: 'food', source: 'seed', createdAt: 't' }],
      { '@context': {}, '@graph': [{ '@id': 'x#Class_a', '@type': 'rdfs:Class' }] },
    ))
    expect(withHead).toContain('| 1 | food | seed | t | - |')
    expect(withHead).toContain('Head schema census: 1 classes (a); 0 relations ().')
  })
})
