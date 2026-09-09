/**
 * @deepseek-ai/dsh-expert-pdf — pure-function Chinese-capable PDF layout for
 * expert deliverables. `renderPdf(spec)` typesets one DraftSpec (cover, body
 * sections with wrapped CJK paragraphs and reference lines, disclaimer, page
 * chrome) into PDF bytes with a subset-embedded Noto Sans SC. No LLM, no
 * filesystem writes, no plugin services: the drafting pipeline that owns
 * those concerns lives in `@deepseek-ai/dsh-expert-orders`.
 * @module @deepseek-ai/dsh-expert-pdf
 */

export { renderPdf, wrapCjkText, FONT_NAME } from './render.ts'
export { DEFAULT_DISCLAIMER } from './constants.ts'
export type { DraftExpert, DraftSection, DraftSpec } from './types.ts'
