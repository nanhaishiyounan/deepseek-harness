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

/** The Obsidian canvas's graphPage call stub (fixture data; the renderer
 * itself degrades in jsdom, so only the call surface is exercised). */
export const obsidianStubCalls = {
  global: async () => ({
    nodes: [
      { id: 'n1', type: 'Item', name: '酱油', props: { readableId: 'IT-1' }, degree: 3 },
      { id: 'n2', type: 'Customer', name: '宏发食品', props: {}, degree: 1 },
    ],
    edges: [{ id: 'e1', relation: 'orderedItem', source: 'n2', target: 'n1' }],
    truncated: false,
    stats: { nodes: 2, edges: 1, islands: 1, largest_component: 2 },
  }),
  local: async (nodeId: string, hops: number) => ({
    nodes: [{ id: nodeId, type: 'Item', name: '酱油', props: {}, degree: 3 }],
    edges: [],
    truncated: false,
    hops,
  }),
  search: async () => [{ id: 'n1', type: 'Item', name: '酱油', degree: 3 }],
  node: async (nodeId: string) => ({
    id: nodeId, type: 'Item', name: '酱油', props: {}, degree: 3,
    out_relations: [{ relation: 'orderedItem', direction: 'out' as const, other_id: 'n2', other_name: 'SO000001', other_type: 'SalesOrder' }],
    in_relations: [],
  }),
}
