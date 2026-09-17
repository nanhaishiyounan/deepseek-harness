/**
 * Shared resolution basis for model-visible relative paths: every tool that
 * accepts a workspace-relative path from the model resolves it against the
 * calling agent's session cwd, so each session's tools act on ITS workspace,
 * not the backend's configured default (the server's launch directory). The
 * pure function lives at the fs seam so tool packages share one
 * implementation instead of per-tool copies.
 * @module @deepseek-ai/dsh-fs/session-path
 */

import { canonicalPath } from '@deepseek-ai/dsh-sandbox'

const PARENT_PATH_SEGMENT = /(?:^|[\\/])\.\.(?:[\\/]|$)/

/**
 * The cwd a model-supplied relative path resolves against.
 * @param cwd - the calling agent's session cwd, or `undefined` for a non-agent caller.
 * @param requestedPath - the path the provider will resolve; parent traversal
 *   makes a symlinked cwd's filesystem identity observable.
 * @returns the session cwd to resolve against — canonicalized when either side
 *   traverses a parent segment — or `undefined` when none applies (the backend
 *   then applies its own default).
 */
export function sessionResolveCwd(cwd: string | undefined, requestedPath: string): string | undefined {
  if (cwd === undefined || (!PARENT_PATH_SEGMENT.test(cwd) && !PARENT_PATH_SEGMENT.test(requestedPath))) return cwd
  return canonicalPath(cwd)
}
