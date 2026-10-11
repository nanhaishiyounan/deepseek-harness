import { describe, expect, it } from 'vitest'
import { assertReadOnlyCypher, readOnlyCypherVerdict } from '../src/cypher-guard.ts'
import { CypherGuardError } from '../src/cypher-guard.ts'

describe('readOnlyCypherVerdict', () => {
  it('accepts single read statements', () => {
    expect(readOnlyCypherVerdict('MATCH (n:__Entity) RETURN n.gid AS gid')).toEqual({ allowed: true, code: undefined })
    expect(readOnlyCypherVerdict('OPTIONAL MATCH (n)-[r]->(m) RETURN count(r) AS c;')).toEqual({ allowed: true, code: undefined })
    expect(readOnlyCypherVerdict('WITH 1 AS x MATCH (n) RETURN x, n LIMIT 10')).toEqual({ allowed: true, code: undefined })
    expect(readOnlyCypherVerdict('UNWIND [1,2] AS i RETURN i')).toEqual({ allowed: true, code: undefined })
  })

  it('rejects write clauses anywhere in the statement', () => {
    for (const cypher of [
      'MATCH (n) DELETE n',
      'MATCH (n) DETACH DELETE n',
      'MERGE (n:Item {gid: "x"}) RETURN n',
      'CREATE (n:Item) RETURN n',
      'MATCH (n) SET n.name = "x" RETURN n',
      'MATCH (n) REMOVE n.name RETURN n',
      'MATCH (n) DROP n',
      'CALL db.labels() YIELD label RETURN label',
      'LOAD CSV WITH HEADERS FROM "file:///x.csv" AS row RETURN row',
      'MATCH (n) FOREACH (x IN [1] | CREATE (m)) RETURN n',
      'INSERT INTO x RETURN 1',
    ]) {
      expect(readOnlyCypherVerdict(cypher)).toEqual({ allowed: false, code: 'NEO4J_CYPHER_NOT_READONLY' })
    }
  })

  it('rejects non-read openers, missing RETURN, multi-statement, and blank text', () => {
    expect(readOnlyCypherVerdict('RETURN 1').code).toBe('NEO4J_CYPHER_NOT_READONLY')
    expect(readOnlyCypherVerdict('MATCH (n)').code).toBe('NEO4J_CYPHER_NO_RETURN')
    expect(readOnlyCypherVerdict('MATCH (n) RETURN n; MATCH (m) RETURN m').code).toBe('NEO4J_CYPHER_MULTI_STATEMENT')
    expect(readOnlyCypherVerdict('   ').code).toBe('NEO4J_CYPHER_EMPTY')
  })

  it('cannot be masked by literals or comments', () => {
    expect(readOnlyCypherVerdict("MATCH (n) WHERE n.name = 'DELETE all' RETURN n")).toEqual({ allowed: true, code: undefined })
    expect(readOnlyCypherVerdict('MATCH (n) // harmless looking\nSET n.x = 1 RETURN n').code).toBe('NEO4J_CYPHER_NOT_READONLY')
    expect(readOnlyCypherVerdict('MATCH (n) /* comment */ RETURN n; MATCH (m) DETACH DELETE m').code).toBe('NEO4J_CYPHER_MULTI_STATEMENT')
  })

  it('assertReadOnlyCypher throws the structured error on refusal', () => {
    expect(() => assertReadOnlyCypher('MATCH (n) DELETE n')).toThrowError(CypherGuardError)
    try {
      assertReadOnlyCypher('MERGE (n) RETURN n')
      expect.unreachable('the guard must throw')
    } catch (error) {
      expect(error instanceof CypherGuardError && error.code).toBe('NEO4J_CYPHER_NOT_READONLY')
    }
  })
})
