/**
 * One opaque client-side id (attachment row ids, wire rpcIds): prefers
 * `crypto.randomUUID` and falls back to 16 random bytes in hex when the
 * secure-context-only API is absent — the LAN HTTP deployment serves the
 * mobile page without HTTPS, where a bare `crypto.randomUUID()` call would
 * throw and silently kill the camera, album, file, and login lanes.
 */

/** The random-bytes id length (two hex digits per byte). */
const FALLBACK_BYTES = 16

/**
 * One opaque client-side id, preferring the secure-context API.
 * @returns a unique id — UUID format when the secure context provides the
 * API, else the 32-hex-digit form of 16 random bytes.
 */
export function uid(): string {
  const api = globalThis.crypto
  if (typeof api?.randomUUID === 'function') return api.randomUUID()
  const bytes = new Uint8Array(FALLBACK_BYTES)
  api.getRandomValues(bytes)
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}
