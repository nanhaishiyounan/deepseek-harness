import { describe, expect, it } from 'vitest'
import { fuseRrf } from '@deepseek-ai/dsh-kb'

describe('fuseRrf', () => {
  it('returns nothing for two empty rankings', () => {
    expect(fuseRrf([], [], 60)).toEqual([])
  })

  it('keeps a text-only ranking in order', () => {
    expect(fuseRrf([5, 3, 1], [], 60).map(e => e.id)).toEqual([5, 3, 1])
  })

  it('keeps a vector-only ranking in order', () => {
    expect(fuseRrf([], [9, 2], 60).map(e => e.id)).toEqual([9, 2])
  })

  it('ranks candidates hit by both paths first', () => {
    const fused = fuseRrf([1, 2], [2, 3], 60)
    expect(fused.map(e => e.id)).toEqual([2, 1, 3])
    expect(fused[0]?.score).toBeCloseTo(1 / 61 + 1 / 62, 10)
  })

  it('breaks score ties by ascending id', () => {
    const fused = fuseRrf([1, 2], [2, 1], 60)
    expect(fused[0]?.score).toBe(fused[1]?.score)
    expect(fused.map(e => e.id)).toEqual([1, 2])
  })

  it('flattens the rank gap for larger k', () => {
    const small = fuseRrf([1, 2], [], 1)
    const large = fuseRrf([1, 2], [], 1000)
    const smallGap = (small[0]?.score ?? 0) - (small[1]?.score ?? 0)
    const largeGap = (large[0]?.score ?? 0) - (large[1]?.score ?? 0)
    expect(smallGap).toBeGreaterThan(largeGap)
  })
})
