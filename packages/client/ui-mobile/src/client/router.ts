/**
 * Hash router for the mobile v5 shell: `#/` (home, the default landing),
 * `#/chats`, `#/chat/<id>`, `#/work`, `#/work/<id>` (param sub-route
 * isomorphic to chat), `#/me`, `#/tasks`, `#/files`, `#/agents`, `#/login`.
 * A bare `#/chat` (no id) folds onto `chats` — the chat view has no
 * id-less face, so the fallback mirrors the work/:bad-id pattern. The
 * v1/v2 route heads (messages/workbench/data/kg/contacts/profile) fold
 * onto the v5 pages by meaning — workbench lands on work, contacts on
 * agents — so old deep links, including the PC preview iframe's, land on a
 * live page instead of a dead tab.
 */

import { useEffect, useState } from 'react'

/** One parsed route. */
export interface MobileRoute {
  readonly name: 'home' | 'chats' | 'chat' | 'work' | 'me' | 'tasks' | 'files' | 'agents' | 'login'
  /** Route parameter: the session id on `chat`, the work item id on `work`. */
  readonly param?: string
  /** Query parameters of the hash. */
  readonly query: ReadonlyURLSearchParams
}

/** The read-only view over a route's query string. */
export interface ReadonlyURLSearchParams {
  get(name: string): string | null
}

/** The v1/v2 hash heads that fold onto the v5 routes (third-generation landing table). */
const LEGACY_HEADS: Readonly<Record<string, 'chats' | 'work' | 'me' | 'agents'>> = {
  messages: 'chats',
  workbench: 'work',
  data: 'chats',
  kg: 'chats',
  contacts: 'agents',
  profile: 'me',
}

/**
 * Parse one hash string onto a route.
 * @param hash - the raw location hash (leading `#` optional).
 * @returns the parsed route.
 */
export function parseRoute(hash: string): MobileRoute {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const [path = '', query = ''] = raw.split('?', 2)
  const params: ReadonlyURLSearchParams = new URLSearchParams(query)
  const segments = path.split('/').filter(segment => segment !== '')
  const [head, param] = segments as [string | undefined, string | undefined]
  if (head === 'work') {
    return param === undefined
      ? { name: 'work' as const, query: params }
      : { name: 'work' as const, param, query: params }
  }
  if (head === 'chat') {
    return param === undefined
      ? { name: 'chats' as const, query: params }
      : { name: 'chat' as const, param, query: params }
  }
  if (head === 'chats') return { name: 'chats' as const, query: params }
  if (head === 'me') return { name: 'me' as const, query: params }
  if (head === 'tasks') return { name: 'tasks' as const, query: params }
  if (head === 'files') return { name: 'files' as const, query: params }
  if (head === 'agents') return { name: 'agents' as const, query: params }
  if (head === 'login') return { name: 'login' as const, query: params }
  const legacy = head === undefined ? undefined : LEGACY_HEADS[head]
  if (legacy !== undefined) return { name: legacy, query: params }
  return { name: 'home' as const, query: params }
}

/**
 * Subscribe to the current hash route.
 * @returns the parsed route, recomputed on every hashchange.
 */
export function useRoute(): MobileRoute {
  const [route, setRoute] = useState<MobileRoute>(() => parseRoute(location.hash))
  useEffect(() => {
    const onChange = (): void => { setRoute(parseRoute(location.hash)) }
    window.addEventListener('hashchange', onChange)
    return () => { window.removeEventListener('hashchange', onChange) }
  }, [])
  return route
}

/**
 * Navigate to a hash path.
 * @param hash - target hash including the leading `#`.
 */
export function navigate(hash: string): void {
  location.hash = hash
}

/**
 * The full-screen layers' back action: natural history first (work detail can
 * arrive from the work tab or the tasks page), the owning domain tab as the
 * no-history fallback (02 §7.2).
 * @param fallbackHash - the domain tab to land on when history is empty.
 */
export function goBackOr(fallbackHash: string): void {
  if (history.length > 1) {
    history.back()
    return
  }
  navigate(fallbackHash)
}
