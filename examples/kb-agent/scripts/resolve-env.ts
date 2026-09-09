/**
 * Resolve environment variables with a fallback to the repository root
 * `.env` — the shared way demo scripts and e2e tests read MINIMAX_API_KEY /
 * NOCOBASE_* credentials without every entry point duplicating the fallback.
 * @module resolve-env
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/**
 * Resolve one variable from the environment, falling back to the repo root `.env`.
 * @param name - the variable name.
 * @returns the unquoted value, or `undefined` when neither source has a non-empty one.
 */
export function resolveEnv(name: string): string | undefined {
  const direct = process.env[name]
  if (direct !== undefined && direct !== '') return direct
  const envPath = join(repoRoot, '.env')
  if (!existsSync(envPath)) return undefined
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith(`${name}=`)) continue
    const raw = trimmed.slice(name.length + 1)
    if (raw !== '') return raw.replaceAll(/^["']|["']$/gu, '')
  }
  return undefined
}
