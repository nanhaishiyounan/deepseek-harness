/**
 * kg-build pipeline error taxonomy.
 * @module @deepseek-ai/dsh-kg-build/error
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/**
 * Typed pipeline error with a machine-routable `code`. Shared codes cover a
 * missing seam, a disabled source, missing credentials, and an unmappable
 * collection whitelist entry.
 */
export class KgBuildError extends HarnessError {}
