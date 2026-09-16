/**
 * view-actions domain zod schemas (respond is a client-response; the payload
 * schema serves the /api/respond endpoint's second parse after routing via the
 * pending table, mirroring questions.schema.ts).
 */

import { z } from 'zod'
import type { ViewActionResult } from '@deepseek-ai/dsh-view-actions/types'
import { sessionIdSchema } from './sessions.schema.ts'

/** View-action answer payload (the result.value slot of a client-response). */
export const viewActionResponsePayloadSchema = z.object({
  sessionId: sessionIdSchema,
  summary: z.string().min(1),
}) satisfies z.ZodType<ViewActionResult & { sessionId: unknown }>
