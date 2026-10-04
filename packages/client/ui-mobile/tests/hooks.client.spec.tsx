// @vitest-environment jsdom
/**
 * The async-data hooks: usePoll's ready/error/refresh cycle over a stubbed
 * producer (the initial read, the failure face, the retry that recovers, and
 * the suspended poll while inactive) and useAsync's manual refresh.
 */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAsync, usePoll } from '../src/client/hooks.ts'

let producer: () => Promise<string>
let reads: number

beforeEach(() => {
  vi.useFakeTimers()
  reads = 0
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
})

describe('usePoll', () => {
  it('reads ready values on the interval and re-reads through refresh', async () => {
    producer = vi.fn(async () => {
      reads += 1
      return `read-${String(reads)}`
    })
    const { result } = renderHook(() => usePoll(producer, 1000, true))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.status).toBe('ready')
    expect(result.current.value).toBe('read-1')
    // The interval re-reads without any manual nudge.
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    expect(result.current.value).toBe('read-2')
    // refresh re-reads ahead of the timer.
    result.current.refresh()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.value).toBe('read-3')
  })

  it('surfaces the failure face and recovers on the next tick', async () => {
    let fail = true
    producer = vi.fn(async () => {
      if (fail) throw new Error('目录 503')
      return 'recovered'
    })
    const { result } = renderHook(() => usePoll(producer, 1000, true))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('目录 503')
    // The error cell's refresh re-runs the producer immediately.
    result.current.refresh()
    fail = false
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.status).toBe('ready')
    expect(result.current.value).toBe('recovered')
  })

  it('stays loading while inactive and reads once the gate opens', async () => {
    producer = vi.fn(async () => 'gated')
    const { result, rerender } = renderHook(({ active }) => usePoll(producer, 1000, active), { initialProps: { active: false } })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(result.current.status).toBe('loading')
    expect(producer).not.toHaveBeenCalled()
    rerender({ active: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.status).toBe('ready')
    expect(result.current.value).toBe('gated')
  })
})

describe('useAsync', () => {
  it('refreshes through the tick without changing the fetcher identity', async () => {
    let reads = 0
    producer = vi.fn(async () => {
      reads += 1
      return `async-${String(reads)}`
    })
    const { result } = renderHook(() => useAsync(producer))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.value).toBe('async-1')
    result.current.refresh()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.value).toBe('async-2')
  })

  it('names a failed fetch', async () => {
    producer = vi.fn(async () => { throw new Error('加载失败') })
    const { result } = renderHook(() => useAsync(producer))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('加载失败')
  })

  it('suspends while gated off and re-reads in place when a keep-alive page becomes visible', async () => {
    let reads = 0
    producer = vi.fn(async () => {
      reads += 1
      return `gate-${String(reads)}`
    })
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useAsync(producer, active),
      { initialProps: { active: false } },
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.status).toBe('loading')
    expect(producer).not.toHaveBeenCalled()
    rerender({ active: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.value).toBe('gate-1')
    // Hiding keeps the last read on screen (no skeleton flash, no fetch).
    rerender({ active: false })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.status).toBe('ready')
    expect(result.current.value).toBe('gate-1')
    expect(producer).toHaveBeenCalledTimes(1)
    // Becoming visible again re-reads and swaps the value in place.
    rerender({ active: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.status).toBe('ready')
    expect(result.current.value).toBe('gate-2')
  })
})
