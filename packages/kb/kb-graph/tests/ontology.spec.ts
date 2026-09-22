/**
 * Built-in ontology registration tests for the cross-source coreference
 * relation: `corefers_with` exists as an unrestricted object relation, and
 * the added relation bumped the ontology's minor version.
 */

import { describe, expect, it } from 'vitest'
import { builtinOntology, exportOntology, kgRelationId, ONTOLOGY_VERSION } from '../src/index.ts'

describe('builtin ontology corefers_with', () => {
  it('registers corefers_with as an unrestricted object relation', () => {
    const relation = builtinOntology().relations.find(entry => entry.id === kgRelationId('corefers_with'))
    expect(relation).toBeDefined()
    expect(relation?.constraints).toEqual([])
    expect(relation?.kind).toBe('object')
    expect(relation?.source).toBe('builtin-ontology')
  })

  it('carries the minor version the added relation bumped', () => {
    expect(ONTOLOGY_VERSION).toBe('1.2.0')
    expect(exportOntology().version).toBe(ONTOLOGY_VERSION)
  })
})
