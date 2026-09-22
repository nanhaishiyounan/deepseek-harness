/**
 * @deepseek-ai/dsh-client-ui-mobile — mobile client shell library entry. The
 * shell's product is {@link AppMobileEntry}; apps/web's Vite mobile entry runs
 * it against #mobile-root. Everything here is browser-safe and cordis-free:
 * the page talks to the same /api gateway the PC shell uses, so sessions,
 * KG, and business rows are shared verbatim with the PC client.
 * @module @deepseek-ai/dsh-client-ui-mobile
 */

export { AppMobileEntry } from './client/entry.tsx'
export { foldHistory, type ChatItem, type FoldedTurn } from './client/fold.ts'
export { parseFormDrafts, type FormDraft, type PushReceipt } from './client/form-draft.ts'
