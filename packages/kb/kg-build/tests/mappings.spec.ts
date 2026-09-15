// The declarative kg-mappings.yml reader: strict parse (every structural
// surprise fails loud with the offending path), rule toggles default on,
// fk links carry their wiring, and a config that still uses the retired
// inline `collections` key fails the plugin constructor instead of
// silently mapping nothing.

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { parseMappings } from '../src/mappings.ts'
import { Config, KgBuildRuntime } from '../src/index.ts'

const VALID = `
version: 1
sources:
  - system: nocobase
    collections:
      - name: experts
        anchor: Expert
        titleField: name
      - name: orders
        anchor: Order
        fkLinks:
          - field: serviceId
            target: expert_services
            relation: ordered_service
            style: collection-address
rules:
  skipHiddenCollections: true
  emptyFkNoEdge: false
`

describe('parseMappings', () => {
  it('parses a valid document with collections, fk links, and rule toggles', () => {
    const file = parseMappings(VALID, 'kg-mappings.yml')
    expect(file.version).toBe(1)
    expect(file.sources).toHaveLength(1)
    expect(file.sources[0]?.system).toBe('nocobase')
    expect(file.sources[0]?.collections.map(entry => entry.name)).toEqual(['experts', 'orders'])
    expect(file.sources[0]?.collections[1]?.fkLinks).toEqual([
      { field: 'serviceId', target: 'expert_services', relation: 'ordered_service', style: 'collection-address' },
    ])
    expect(file.rules).toEqual({ skipHiddenCollections: true, emptyFkNoEdge: false, derivesTitle: true })
  })

  it('rejects an unsupported version', () => {
    expect(() => parseMappings('version: 2\nsources: []\n', 'f.yml')).toThrow(/f\.yml\.version.*expected 1/)
  })

  it('rejects an unknown source system (closed set)', () => {
    expect(() => parseMappings('version: 1\nsources:\n  - system: csv\n    collections: []\n', 'f.yml'))
      .toThrow(/expected "nocobase", got "csv"/)
  })

  it('rejects a duplicate collection name', () => {
    const text = 'version: 1\nsources:\n  - system: nocobase\n    collections:\n      - name: a\n      - name: a\n'
    expect(() => parseMappings(text, 'f.yml')).toThrow(/duplicate collection "a"/)
  })

  it('rejects an unknown collection key and an unknown rule key', () => {
    expect(() => parseMappings('version: 1\nsources:\n  - system: nocobase\n    collections:\n      - name: a\n        bogus: 1\n', 'f.yml'))
      .toThrow(/unknown collection key/)
    expect(() => parseMappings('version: 1\nsources: []\nrules:\n  bogusRule: true\n', 'f.yml'))
      .toThrow(/unknown rule key/)
  })

  it('rejects an fk link missing its field or carrying a bad style', () => {
    const missing = 'version: 1\nsources:\n  - system: nocobase\n    collections:\n      - name: a\n        fkLinks:\n          - target: b\n            relation: a.b\n'
    expect(() => parseMappings(missing, 'f.yml')).toThrow(/required field missing/)
    const badStyle = 'version: 1\nsources:\n  - system: nocobase\n    collections:\n      - name: a\n        fkLinks:\n          - field: f\n            target: b\n            relation: a.b\n            style: magic\n'
    expect(() => parseMappings(badStyle, 'f.yml')).toThrow(/plain-id or collection-address/)
  })

  it('defaults every rule to true when the rules block is absent', () => {
    const file = parseMappings('version: 1\nsources:\n  - system: nocobase\n    collections: []\n', 'f.yml')
    expect(file.rules).toEqual({ skipHiddenCollections: true, emptyFkNoEdge: true, derivesTitle: true })
  })

  it('rejects non-object or unparseable documents', () => {
    expect(() => parseMappings('- just\n- a\n- list\n', 'f.yml')).toThrow(/top-level mapping object/)
    expect(() => parseMappings('version: [1\n', 'f.yml')).toThrow(/YAML parse failed/)
  })
})

describe('kg-build config', () => {
  it('carries mappingsFile through and fails loud on the retired inline collections key', async () => {
    const resolved = Config({ tenant: 't', nocobase: { mappingsFile: 'kg-mappings.yml' } })
    expect(resolved.nocobase?.mappingsFile).toBe('kg-mappings.yml')
    // The retired inline key is captured only so the plugin constructor can
    // reject it with the migration instruction (misconfiguration fails loud).
    const context = new Context()
    await expect(context.plugin(KgBuildRuntime, {
      tenant: 't',
      nocobase: { collections: [{ name: 'experts' }] },
    })).rejects.toMatchObject({ code: 'KG_BUILD_MAPPINGS_INVALID' })
    await context.fiber.dispose()
  })
})
