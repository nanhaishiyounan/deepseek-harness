/**
 * The demo-mode typing indicator (split from ChatView, W8-B2; the 04 §4.2
 * timing contract is unchanged): after a prompt, 2.5s without a new raw
 * event breathes the three dots; the next event clears them. Render state
 * only — never a logged message. The raw-event count (not the folded item
 * count) drives the baseline: the fold merges events, so an item-count
 * comparison would almost never clear the dots.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { currentRunMode } from '../../runMode.ts'

/** The demo-typing cell the conversation page renders. */
export interface DemoTypingCell {
  /** Whether the breathing dots show. */
  readonly typing: boolean
  /** Arm the post-prompt window (a no-op outside demo mode). */
  readonly armAfterSend: () => void
  /** Retire the dots and the pending timer (a failed send must not breathe). */
  readonly retire: () => void
}

/**
 * The demo typing indicator's state cell.
 * @param rawEventCount - the newest raw event count (called every render).
 * @returns the typing cell.
 */
export function useDemoTyping(rawEventCount: number): DemoTypingCell {
  const [demoMode, setDemoMode] = useState(false)
  const [typing, setTyping] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  /** The raw event count at the last prompt (the trigger's baseline). */
  const baseline = useRef(0)
  /** The newest raw event count (kept fresh every render for the timer). */
  const count = useRef(0)
  count.current = rawEventCount

  // Resolve the run mode once; clear the timer on unmount.
  useEffect(() => {
    let alive = true
    void currentRunMode().then((mode) => { if (alive && mode === 'demo') setDemoMode(true) })
    return () => {
      alive = false
      if (timer.current !== undefined) window.clearTimeout(timer.current)
    }
  }, [])

  // A new event after a prompt retires the indicator.
  useEffect(() => {
    if (typing && count.current > baseline.current) setTyping(false)
  }, [typing, rawEventCount])

  const armAfterSend = useCallback(() => {
    if (!demoMode) return
    baseline.current = count.current
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      // Still-silent flow breathes; an already-moved count stays quiet.
      setTyping(count.current === baseline.current)
    }, 2500)
  }, [demoMode])

  const retire = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    setTyping(false)
  }, [])

  return { typing, armAfterSend, retire }
}
