/**
 * The work execution timeline's two data sources (04 §4.1): the
 * TimelineDataSource abstraction with a live implementation that polls the
 * exec session's durable log (tool rows project as steps, the assistant tail
 * message as the result summary) and a demo implementation that advances a
 * fixed step script on timers — pure in-memory state that never touches the
 * durable log. The WorkDetailView consumes the interface only; the source
 * choice rides the run mode plus the item's exec-session presence. Both
 * sources count active subscriptions so the first unsubscribe never stops a
 * source a StrictMode remount (or another consumer) still reads.
 */

import { foldHistory } from '../fold.ts'
import { clockOf, readHistory } from '../sessionsService.ts'

/** One execution-timeline row. */
export interface TimelineStep {
  readonly label: string
  readonly state: 'running' | 'done' | 'error'
  /** One clipped outcome line, when the step produced one. */
  readonly detail?: string
  /** The v6 time column's text: the live tool row's HH:mm, the demo's 01-style index. */
  readonly time?: string
}

/** The timeline snapshot consumers read through useSyncExternalStore. */
export interface TimelineSnapshot {
  readonly steps: readonly TimelineStep[]
  /** True once every running step settled (the doing→review trigger). */
  readonly finished: boolean
  /** The clipped one-sentence outcome, once finished. */
  readonly resultSummary: string | undefined
}

/** The subscription surface both implementations share. */
export interface TimelineDataSource {
  readonly snapshot: TimelineSnapshot
  /** A property-typed function (never an unbound method reference). */
  readonly subscribe: (listener: () => void) => () => void
}

/** Clip one summary line at the first sentence boundary (or 50 chars). */
function clipSummary(text: string): string {
  const clean = text.trim()
  const stop = clean.search(/[。！？.!?\n]/)
  return stop === -1 ? clean.slice(0, 50) : clean.slice(0, stop)
}

/**
 * The live timeline: poll the exec session (default every 2s), fold the
 * events, and project — non-protocol tool rows become steps in order, the
 * newest assistant text becomes the result summary; the turn settling
 * (running→idle) with an assistant tail marks `finished`. A failed read keeps
 * the last snapshot for the next tick. Polling runs while at least one
 * subscription stands.
 * @param sessionId - the isolated execution session's id.
 * @param pollMs - the poll period (tests shrink it).
 * @returns the polling data source.
 */
export function liveTimeline(sessionId: string, pollMs: number = 2000): TimelineDataSource {
  const listeners = new Set<() => void>()
  let snapshot: TimelineSnapshot = { steps: [], finished: false, resultSummary: undefined }
  /** The broadcast signature: per-step label+state pairs plus the finish pair. */
  let signature = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let polling = false

  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  const read = (): void => {
    void readHistory(sessionId).then((events) => {
      const folded = foldHistory(events)
      const steps: TimelineStep[] = []
      let summary: string | undefined
      for (const item of folded.items) {
        if (item.kind === 'tool') {
          if (item.protocol === true) continue
          steps.push({ label: item.label, state: item.state, time: clockOf(item.time) })
          continue
        }
        if (item.kind === 'text' && item.role === 'assistant') summary = clipSummary(item.text)
      }
      const finished = !folded.running && steps.length > 0 && summary !== undefined
      // The signature covers every step's state: a running→done flip without
      // a new row (same count) still broadcasts.
      const next = `${steps.map(step => `${step.label}:${step.state}`).join('|')}#${finished ? 1 : 0}#${finished ? summary : ''}`
      const changed = next !== signature
      if (changed) {
        signature = next
        snapshot = { steps, finished, resultSummary: finished ? summary : undefined }
        notify()
      }
    }, () => {
      // A failed poll tick keeps the last snapshot; the next tick retries.
    }).finally(() => {
      if (polling) timer = setTimeout(read, pollMs)
    })
  }

  return {
    get snapshot(): TimelineSnapshot {
      return snapshot
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      if (!polling) {
        polling = true
        read()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && polling) {
          polling = false
          if (timer !== undefined) {
            clearTimeout(timer)
            timer = undefined
          }
        }
      }
    },
  }
}

/** The demo script's fixed steps (读取→汇总→起草→定稿, 04 §4.1). */
const DEMO_LABELS: readonly string[] = ['读取工作上下文', '汇总关键信息', '起草处理结果', '核对并定稿']

/** The demo time column: the design's 01-style ordinal per step. */
function demoTimeOf(index: number): string {
  return String(index + 1).padStart(2, '0')
}

/**
 * The demo timeline: timers advance the fixed step script (default 1s per
 * step), the current step breathing, settled steps green; the final tick
 * finishes all steps and emits the canned result summary. `startFinished`
 * renders the completed ledger at once for items already past doing (a
 * review/done demo item re-runs nothing). Pure memory, never the log; timers
 * run while at least one subscription stands.
 * @param title - the work item's title (rides the canned summary).
 * @param stepMs - the per-step advance period (tests shrink it).
 * @param startFinished - render the finished state immediately.
 * @returns the timer-driven data source.
 */
export function demoTimeline(title: string, stepMs: number = 1000, startFinished = false): TimelineDataSource {
  const finishedSnapshot: TimelineSnapshot = {
    steps: DEMO_LABELS.map((label, index) => ({ label, state: 'done' as const, time: demoTimeOf(index) })),
    finished: true,
    resultSummary: `已完成「${title}」的处理，结果摘要已生成，请确认`,
  }
  if (startFinished) {
    const idleListeners = new Set<() => void>()
    return {
      snapshot: finishedSnapshot,
      subscribe: (listener: () => void) => {
        idleListeners.add(listener)
        return () => { idleListeners.delete(listener) }
      },
    }
  }
  const listeners = new Set<() => void>()
  let settled = 0
  let snapshot: TimelineSnapshot = { steps: [], finished: false, resultSummary: undefined }
  let timer: ReturnType<typeof setTimeout> | undefined

  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  const advance = (): void => {
    settled += 1
    const finished = settled >= DEMO_LABELS.length
    snapshot = finished
      ? finishedSnapshot
      : {
        steps: [
          ...DEMO_LABELS.slice(0, settled).map((label, index) => ({ label, state: 'done' as const, time: demoTimeOf(index) })),
          { label: DEMO_LABELS[settled] as string, state: 'running' as const, time: demoTimeOf(settled) },
        ],
        finished: false,
        resultSummary: undefined,
      }
    notify()
    if (!finished) timer = setTimeout(advance, stepMs)
  }

  return {
    get snapshot(): TimelineSnapshot {
      return snapshot
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      if (timer === undefined && settled < DEMO_LABELS.length) {
        timer = setTimeout(advance, stepMs)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && timer !== undefined) {
          clearTimeout(timer)
          timer = undefined
        }
      }
    },
  }
}
