import { describe, expect, it } from 'vitest'
import { louvainCommunities } from '../src/louvain.ts'

describe('louvainCommunities', () => {
  it('splits two strongly bridged cliques into two communities', () => {
    // Two triangles joined by a doubly-anchored bridge: the two-sided
    // partition beats every three-way cut, so louvain lands on two sides.
    const nodeIds = ['a1', 'a2', 'a3', 'ba', 'bb', 'b1', 'b2', 'b3']
    const pairs = [
      ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a1'],
      ['a1', 'ba'], ['a2', 'ba'], ['ba', 'bb'], ['bb', 'b1'], ['bb', 'b2'],
      ['b1', 'b2'], ['b2', 'b3'], ['b3', 'b1'],
    ] as const
    const result = louvainCommunities(nodeIds, pairs)
    expect(result.communities).toBe(2)
    expect(result.modularity).toBeGreaterThan(0.3)
    const assignment = (id: string): number => result.assignments.get(id) as number
    expect(assignment('a1')).toBe(assignment('a2'))
    expect(assignment('a2')).toBe(assignment('a3'))
    expect(assignment('a1')).toBe(assignment('ba'))
    expect(assignment('b1')).toBe(assignment('b2'))
    expect(assignment('b2')).toBe(assignment('b3'))
    expect(assignment('b1')).toBe(assignment('bb'))
    expect(assignment('a1')).not.toBe(assignment('b1'))
  })

  it('keeps a weak bridge as its own community when that maximizes modularity', () => {
    // The single-stub bridge pair beats merging into either triangle
    // (Q=0.426 vs 0.389), so the honest louvain answer is three groups.
    const nodeIds = ['a1', 'a2', 'a3', 'ba', 'bb', 'b1', 'b2', 'b3']
    const pairs = [
      ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a1'],
      ['a1', 'ba'], ['ba', 'bb'], ['bb', 'b1'],
      ['b1', 'b2'], ['b2', 'b3'], ['b3', 'b1'],
    ] as const
    const result = louvainCommunities(nodeIds, pairs)
    expect(result.communities).toBe(3)
    expect(result.modularity).toBeCloseTo(0.4259, 3)
    expect(result.assignments.get('ba')).toBe(result.assignments.get('bb'))
    expect(result.assignments.get('a1')).not.toBe(result.assignments.get('ba'))
  })

  it('is deterministic across repeated runs', () => {
    const nodeIds = ['a1', 'a2', 'a3', 'ba', 'bb', 'b1', 'b2', 'b3']
    const pairs = [
      ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a1'], ['a1', 'ba'], ['ba', 'bb'], ['bb', 'b1'],
      ['b1', 'b2'], ['b2', 'b3'], ['b3', 'b1'],
    ] as const
    const first = louvainCommunities(nodeIds, pairs)
    const second = louvainCommunities(nodeIds, pairs)
    expect([...second.assignments.entries()]).toEqual([...first.assignments.entries()])
    expect(second.modularity).toBe(first.modularity)
  })

  it('returns singletons with zero modularity on an edgeless graph', () => {
    const result = louvainCommunities(['x', 'y', 'z'], [])
    expect(result.communities).toBe(3)
    expect(result.modularity).toBe(0)
    expect(result.assignments.get('x')).toBe(0)
    expect(result.assignments.get('y')).toBe(1)
    expect(result.assignments.get('z')).toBe(2)
  })

  it('drops pairs whose endpoints sit outside the node list', () => {
    const result = louvainCommunities(['x', 'y'], [['x', 'ghost'], ['x', 'y']])
    // One community over a connected pair scores Q = 0 (the whole-graph
    // partition always does); the ghost stub simply drops.
    expect(result.communities).toBe(1)
    expect(result.modularity).toBe(0)
  })

  it('splits an unweighted ring into contiguous dyads', () => {
    // On C6 the three-dyad partition (Q = 1/6) beats the single ring (Q = 0)
    // — the true modularity optimum, not a bug.
    const ring = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']
    const pairs = ring.map((node, index) => [node, ring[(index + 1) % ring.length] as string] as const)
    const result = louvainCommunities(ring, pairs)
    expect(result.communities).toBe(3)
    expect(result.modularity).toBeCloseTo(1 / 6, 6)
    const assignment = (id: string): number => result.assignments.get(id) as number
    expect(assignment('r1')).toBe(assignment('r2'))
    expect(assignment('r3')).toBe(assignment('r4'))
    expect(assignment('r5')).toBe(assignment('r6'))
  })

  it('handles parallel pairs and self-loops without distortion', () => {
    const nodes = ['p', 'q', 's']
    const result = louvainCommunities(nodes, [['p', 'q'], ['p', 'q'], ['s', 's']])
    // The doubled edge is one weight-2 stub pair; the self-loop contributes
    // no cross-community pull, so p+q cluster and s stays alone.
    expect(result.assignments.get('p')).toBe(result.assignments.get('q'))
    expect(result.assignments.get('p')).not.toBe(result.assignments.get('s'))
  })
})
