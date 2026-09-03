// Shared client-spec fixtures: a minimal conversation snapshot, a store-bound
// selector hook stub, and the session-list hook stub the entry reads.

import { useSyncExternalStore } from 'react'
import type {
  ConversationSnapshot, SessionListState, SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import { EMPTY_CHAT_SNAPSHOT, EMPTY_CONVERSATION_VIEWS } from '@deepseek-ai/dsh-client-runtime/client'
import type { KbClientState } from '../src/client/kbStore.ts'

/** A conversation snapshot with only the fields the KB surfaces read. */
export function conversationSnapshot(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    sessionId: 's1' as ConversationSnapshot['sessionId'],
    views: EMPTY_CONVERSATION_VIEWS,
    chat: EMPTY_CHAT_SNAPSHOT,
    nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [],
    pending: [], queue: [], running: false, composerPhase: 'active', removed: false,
    openState: 'open', openError: null, hasMore: false, loadingOlder: false,
    promptError: null, blank: false, subagent: null, lastAgentError: null,
    ...overrides,
  }
}

/**
 * Bind a snapshot store as the renderer-style selector hook the components
 * expect (the whole-snapshot and primitive selectors the surfaces use).
 * @param store - the store to bind.
 * @returns the selector hook stub.
 */
export function bindStoreHook<T>(store: SnapshotStore<T>): (select: (snapshot: T) => unknown) => unknown {
  return (select: (snapshot: T) => unknown) =>
    useSyncExternalStore(store.subscribe.bind(store), () => select(store.getSnapshot()))
}

/** A session-list snapshot with one current session row. */
export function sessionListState(current: { id: string; blank: boolean }): SessionListState {
  return {
    ids: [current.id] as SessionListState['ids'],
    byId: {
      [current.id]: {
        id: current.id as never, displayTitle: current.id, running: false,
        blank: current.blank, updatedAt: 1,
      },
    },
    current: current.id as SessionListState['current'],
    phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  }
}

/** Standard-kit stubs (session + global seats) the session-scope seats type-check against. */
export const SESSION_KIT = {
  sessionId: 's1' as never,
  useSession: (() => undefined) as never,
  useProjection: (() => undefined) as never,
  useInput: (() => undefined) as never,
  inputActions: undefined as never,
  useSessions: (() => undefined) as never,
  useWorkspaces: (() => undefined) as never,
} as const

/** The global-seat stub the root-scope seats type-check against. */
export const GLOBAL_KIT = {
  useWorkspaces: (() => undefined) as never,
} as const

/** The ready stats cache value the chips and badges show. */
export const READY_USAGE = { documents: 12, searches: 35, ingestedDocuments: 9 }

/** A ready-stats client state. */
export function readyState(usage = READY_USAGE): KbClientState {
  return { stats: { status: 'ready', usage }, records: [] }
}
