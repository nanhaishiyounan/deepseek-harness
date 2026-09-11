/**
 * File-set connector provider plugin: proves one local directory at load,
 * creating it when absent (an occupied or unreadable root still fails the
 * composition), and registers the provider on `ctx.connector`. Every dataset
 * is a raw file; routing decisions stay with the seam's shared data router.
 * @module @deepseek-ai/dsh-connector-file
 */

import { mkdir, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { FileConnectorProvider } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'connector-file'
/** Services required by the file-set provider. */
export const inject = ['connector']

export { FileConnectorProvider, FILE_PROVIDER_ID } from './provider.ts'

/** Default per-file fetch cap; oversized files refuse instead of loading unbounded bytes. */
export const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024

/** Plugin configuration. */
export interface Config {
  /** Directory holding the file set, resolved against the process cwd when relative. */
  root: string
  /** Per-file fetch cap in bytes; defaults to 10485760 (10 MiB). */
  maxFileBytes?: number
}

export const Config: z<Config> = z.object({
  root: z.string().required(),
  maxFileBytes: z.number().step(1).min(1).default(DEFAULT_MAX_FILE_BYTES),
})

/**
 * Prove the root is readable at load, provisioning it when a clean checkout
 * has not created the drop-in directory yet; any other root problem (an
 * occupied path, missing permissions) fails the composition, not the first
 * call.
 * @param ctx - context whose `connector` service receives the registration.
 * @param config - validated plugin configuration.
 */
/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

export async function apply(ctx: Context, config: Config): Promise<void> {
  // schemastery (the exported Config) has already filled every defaulted field.
  const root = resolve(config.root)
  try {
    await readdir(root)
  } catch (error: unknown) {
    /* Swallows only ENOENT — the legitimate not-yet-provisioned first boot.
       ENOTDIR (a file occupies the path), EACCES, and every other errno are
       real misconfiguration and still fail the composition. */
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await mkdir(root, { recursive: true })
  }
  const provider = new FileConnectorProvider(root, (config as ResolvedConfig).maxFileBytes)
  const unregister = ctx.connector.registerProvider(provider)
  ctx.effect(() => unregister, 'connector-file.provider')
}
