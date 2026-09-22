/**
 * Hash router for the mobile v3 shell: `#/chats` (default), `#/chat/<id>`,
 * `#/me`, `#/login`. The v1 route names (messages/workbench/data/profile) and
 * the retired v2 contacts route fold onto the two-tab information
 * architecture so old deep links — including the PC preview iframe's — land
 * on chats/me instead of a dead tab.
 */

import { useEffect, useState } from 'react'

/** One parsed route. */
export interface MobileRoute {
  readonly name: 'login' | 'chats' | 'chat' | 'me'
  /** Route parameter: the session id on `chat`. */
  readonly param?: string
  /** Query parameters of the hash. */
  readonly query: ReadonlyURLSearchParams
}

/** The read-only view over a route's query string. */
export interface ReadonlyURLSearchParams {
  get(name: string): string | null
}

/** The v1/v2 hash heads that redirect onto the v3 tabs. */
const LEGACY_HEADS: Readonly<Record<string, 'chats' | 'me' | 'login'>> = {
  messages: 'chats',
  workbench: 'chats',
  data: 'chats',
  kg: 'chats',
  contacts: 'chats',
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
  if (head === 'chat') {
    return param === undefined
      ? { name: 'chat' as const, query: params }
      : { name: 'chat' as const, param, query: params }
  }
  if (head === 'me') return { name: 'me' as const, query: params }
  if (head === 'login') return { name: 'login' as const, query: params }
  const legacy = head === undefined ? undefined : LEGACY_HEADS[head]
  if (legacy !== undefined) return { name: legacy, query: params }
  return { name: 'chats' as const, query: params }
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
