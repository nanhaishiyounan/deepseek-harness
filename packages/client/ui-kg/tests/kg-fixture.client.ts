// Shared client-spec fixtures: store-bound selector hook stubs and the
// session/global seat kits the kg surfaces type-check against (the ui-kb
// fixture pattern).

import { useSyncExternalStore } from 'react'
import type { SessionListState, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

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
