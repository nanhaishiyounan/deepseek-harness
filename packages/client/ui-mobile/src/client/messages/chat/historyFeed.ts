/**
 * The chat history feed's incremental accumulator (W8-B3): the first read
 * pages the whole tail window; every later poll presents the window's max
 * seq as the `afterSeq` cursor and appends only what arrived. The fold is
 * never incremental itself — it still folds the full accumulated window on
 * every render — so replay semantics stay byte-identical to the polling
 * model this replaces; only the wire payload shrinks.
 *
 * Two guards keep the accumulated window honest without any gateway
 * knowledge of compaction: a cursor page larger than
 * {@link CALIBRATE_THRESHOLD} events (a storm that likely rewrites history —
 * compaction replacement copies arrive together) and
 * {@link CALIBRATE_EVERY_POLLS} elapsed polls both force the next read back
 * to a full window, re-basing the cursor. The feed is a plain record: the
 * caller keeps it in a ref and swaps immutably, so jsdom specs drive it
 * directly.
 */

import type { FoldEvent } from '../../fold.ts'

/** A cursor page above this many events re-bases with a full read instead of merging. */
export const CALIBRATE_THRESHOLD = 40

/** Polls after which one full read re-bases the window (drift insurance). */
export const CALIBRATE_EVERY_POLLS = 30

/** The accumulator's state: the accumulated window, its cursor, and the poll count. */
export interface HistoryFeed {
  /** The accumulated raw events (seq-ordered, deduplicated); the fold's input. */
  readonly events: readonly FoldEvent[]
  /** The max seq already held; undefined before the first full read lands. */
  readonly cursor: number | undefined
  /** Reads served since the last full re-base. */
  readonly polls: number
}

/** The empty feed: no window, no cursor — the first read must be full. */
export const EMPTY_FEED: HistoryFeed = { events: [], cursor: undefined, polls: 0 }

/** The max seq of an event set (0 when empty — seqs are positive). */
function maxSeqOf(events: readonly FoldEvent[]): number {
  let max = 0
  for (const event of events) {
    if (event.seq > max) max = event.seq
  }
  return max
}

/**
 * The first (or re-base) read: adopt the tail window wholesale and start a
 * fresh poll count.
 * @param events - the full tail window the read returned.
 * @returns the re-based feed.
 */
export function fullFeed(events: readonly FoldEvent[]): HistoryFeed {
  return { events: [...events], cursor: maxSeqOf(events), polls: 0 }
}

/**
 * Fold one cursor page into the feed: append the unseen events in seq order
 * (a re-delivered seq replaces its slot — the gateway never rewrites an
 * event, but a retry racing the cursor must stay idempotent), advance the
 * cursor, and count the poll. A page breaching {@link CALIBRATE_THRESHOLD}
 * returns the feed unchanged except for a saturated poll count, so the next
 * read takes the full path.
 * @param feed - the feed the poll started from.
 * @param incoming - the cursor page (events with seq > feed.cursor).
 * @returns the next feed state.
 */
export function mergeFeed(feed: HistoryFeed, incoming: readonly FoldEvent[]): HistoryFeed {
  if (incoming.length > CALIBRATE_THRESHOLD) {
    // A storm this wide (a compaction's replacement copies, a replay, or a
    // long sleep) re-bases rather than merges: merge semantics only hold
    // for windows the accumulated base already covers.
    return { ...feed, polls: CALIBRATE_EVERY_POLLS }
  }
  if (incoming.length === 0) {
    return { ...feed, polls: feed.polls + 1 }
  }
  const bySeq = new Map(feed.events.map(event => [event.seq, event]))
  for (const event of incoming) bySeq.set(event.seq, event)
  const events = [...bySeq.values()].sort((a, b) => a.seq - b.seq)
  return { events, cursor: Math.max(feed.cursor ?? 0, maxSeqOf(incoming)), polls: feed.polls + 1 }
}

/**
 * Whether the next read should be the full window: no cursor yet, the
 * calibration poll budget spent, or an explicit re-base request (the page
 * became visible again — background time may have compacted the log).
 * @param feed - the current feed state.
 * @returns true when the next read carries no cursor.
 */
export function needsFullRead(feed: HistoryFeed): boolean {
  return feed.cursor === undefined || feed.polls >= CALIBRATE_EVERY_POLLS
}
