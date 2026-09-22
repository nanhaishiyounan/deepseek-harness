/**
 * Tiny async-data hook for the mobile app: one fetch state per call site with
 * manual refresh, and an interval poll for the surfaces that need freshness.
 * The page polls where freshness matters (chat, session list) rather than
 * holding streams — the plan's risk-① stance (先实测现有 events 域，轮询够用)
 * keeps the mobile client off the WebSocket machinery. States are
 * discriminated unions so consumers narrow `error`/`value` by `status`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** One asynchronous cell's state (discriminated by `status`). */
export type AsyncCell<T> =
  | { readonly status: 'loading'; readonly value: undefined; readonly error: undefined; readonly refresh: () => void }
  | { readonly status: 'ready'; readonly value: T; readonly error: undefined; readonly refresh: () => void }
  | { readonly status: 'error'; readonly value: undefined; readonly error: string; readonly refresh: () => void }

/**
 * Failure text for any thrown value.
 * @param error - the thrown value.
 * @returns its message text.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Fetch one value and keep it in component state.
 * @param fetcher - async producer; identity changes re-run the fetch.
 * @returns the cell's current state.
 */
export function useAsync<T>(fetcher: () => Promise<T>): AsyncCell<T> {
  const [phase, setPhase] = useState<{ kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error'; message: string }>({ kind: 'loading' })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setPhase({ kind: 'loading' })
    fetcher().then((value) => {
      if (alive) setPhase({ kind: 'ready', value })
    }, (error: unknown) => {
      if (alive) setPhase({ kind: 'error', message: messageOf(error) })
    })
    return () => { alive = false }
  }, [fetcher, tick])
  const refresh = useCallback(() => { setTick(current => current + 1) }, [])
  switch (phase.kind) {
    case 'ready':
      return { status: 'ready', value: phase.value, error: undefined, refresh }
    case 'error':
      return { status: 'error', value: undefined, error: phase.message, refresh }
    default:
      return { status: 'loading', value: undefined, error: undefined, refresh }
  }
}

/** The poll hook's latest read (discriminated by `status`). */
export type PollRead<T> =
  | { readonly status: 'loading'; readonly value: undefined; readonly error: undefined; readonly refresh: () => void }
  | { readonly status: 'ready'; readonly value: T; readonly error: undefined; readonly refresh: () => void }
  | { readonly status: 'error'; readonly value: undefined; readonly error: string; readonly refresh: () => void }

/**
 * Poll an async producer on an interval while `active`.
 * @param producer - async producer returning the fresh value.
 * @param intervalMs - poll period.
 * @param active - polling gate (false suspends the timer).
 * @returns the latest read, refreshed by the timer; `refresh` re-reads now.
 */
export function usePoll<T>(producer: () => Promise<T>, intervalMs: number, active: boolean): PollRead<T> {
  const [read, setRead] = useState<PollRead<T>>({ status: 'loading', value: undefined, error: undefined, refresh: () => {} })
  const producerRef = useRef(producer)
  producerRef.current = producer
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    let alive = true
    let timer: number | undefined
    const run = (): void => {
      producerRef.current().then((next) => {
        if (!alive) return
        setRead({ status: 'ready', value: next, error: undefined, refresh: () => { setTick(current => current + 1) } })
      }, (cause: unknown) => {
        if (!alive) return
        setRead({ status: 'error', value: undefined, error: messageOf(cause), refresh: () => { setTick(current => current + 1) } })
      }).finally(() => {
        if (alive) timer = window.setTimeout(run, intervalMs)
      })
    }
    run()
    return () => {
      alive = false
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [intervalMs, active, tick])
  const refresh = useCallback(() => { setTick(current => current + 1) }, [])
  switch (read.status) {
    case 'ready':
      return { ...read, refresh }
    case 'error':
      return { ...read, refresh }
    default:
      return { status: 'loading', value: undefined, error: undefined, refresh }
  }
}
