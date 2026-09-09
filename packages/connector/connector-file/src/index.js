/**
 * File-set connector provider plugin: scans one local directory at load
 * (fail-loud on a missing root) and registers the provider on
 * `ctx.connector`. Every dataset is a raw file; routing decisions stay with
 * the seam's shared data router.
 * @module @deepseek-ai/dsh-connector-file
 */
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import z from '@deepseek-ai/schemastery';
import { FileConnectorProvider } from "./provider.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = 'connector-file';
/** Services required by the file-set provider. */
export const inject = ['connector'];
export { FileConnectorProvider, FILE_PROVIDER_ID } from "./provider.js";
/** Default per-file fetch cap; oversized files refuse instead of loading unbounded bytes. */
export const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const Config = z.object({
    root: z.string().required(),
    maxFileBytes: z.number().step(1).min(1).default(DEFAULT_MAX_FILE_BYTES),
});
export async function apply(ctx, config) {
    // schemastery (the exported Config) has already filled every defaulted field.
    const root = resolve(config.root);
    await readdir(root);
    const provider = new FileConnectorProvider(root, config.maxFileBytes);
    const unregister = ctx.connector.registerProvider(provider);
    ctx.effect(() => unregister, 'connector-file.provider');
}
//# sourceMappingURL=index.js.map