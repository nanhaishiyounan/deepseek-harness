/**
 * The closed protocol-token denylist shared by the body and subtitle layers
 * (W23-R3 F2): the persona bans these tokens on every card face, but a
 * soft-constraint miss leaked `wfl_approval_todos` into live report-card
 * subtitles, so the render side keeps a closed denylist as the guarantee.
 * Only closed protocol families are stripped here — open-set engineering
 * terms stay a persona concern (the B2 evaluation: a mapping cannot enumerate
 * them and rejection would drop the card). Matching is case-insensitive
 * (W23-R4): a leak arrives in any casing (`WFL_Approval_Todos`, `Ask_Field`,
 * `NB_LIST`).
 */

import { sanitizeBizText } from './messages/rich.ts'
import type { ReportPayload } from './protocol.ts'

/**
 * The one denylist member that strips only inside a protocol context:
 * `suggestions` doubles as a plain English word, so it goes only when the
 * surrounding text is a CJK narrative or carries another stripped family —
 * English body prose keeps the word.
 */
const CONTEXTUAL_FIELD = 'suggestions'

/**
 * The closed protocol-token denylist both display layers share (W23-R3 F2,
 * case-normalized W23-R4): the always-stripped families — `wfl_*`, `ask_*`,
 * and the exact `order_create` / `order_status` protocol action names
 * (W23-R5) — plus the contextual field name. Every runtime matcher (the
 * always-strip pass, the protocol-context probe) derives from this exported
 * list, so appending a family here takes effect in both layers at once; an
 * append reaching only a private array would silently strip nothing.
 */
export const PROTOCOL_BLACKLIST: readonly string[] = [
  'wfl_[a-z0-9_]+',
  'ask_[a-z_]+',
  'order_create',
  'order_status',
  CONTEXTUAL_FIELD,
]

/**
 * The tool and protocol names only the subtitle layer strips (W23-R3 F2): a
 * one-line subtitle has no room for a tool name surviving unmapped, and these
 * closed families cannot appear as legitimate Chinese-subtitle words.
 * Matching is case-insensitive (W23-R4).
 */
const SUBTITLE_BLACKLIST: readonly string[] = [
  'nb_[a-z_]+',
  'kg_[a-z_]+',
  'kb_search',
  'lakehouse_[a-z_]+',
  'connector_[a-z_]+',
  'form_draft',
  'form_confirm',
  'reject_flow',
  'submit_receipt',
  'present_card',
]

/** The exported denylist minus the contextual field name: what strips in every context. */
const ALWAYS_DENYLIST: readonly string[] = PROTOCOL_BLACKLIST.filter(family => family !== CONTEXTUAL_FIELD)

/** A word-boundary, case-insensitive matcher over token-family fragments. */
const familyMatcher = (families: readonly string[]): RegExp =>
  new RegExp(`\\b(?:${families.join('|')})\\b`, 'gi')

const ALWAYS_TOKENS = familyMatcher(ALWAYS_DENYLIST)
const SUBTITLE_TOKENS = familyMatcher(SUBTITLE_BLACKLIST)
const SUGGESTIONS_TOKEN = familyMatcher([CONTEXTUAL_FIELD])

/**
 * A protocol context for the `suggestions` field name (W23-R4): a CJK
 * narrative, or a string that also carries any stripped token family. The
 * probe carries no `g` flag — a global regex would carry `lastIndex` across
 * calls and miss earlier tokens.
 */
const CONTEXT_PROBE = new RegExp(
  `\\b(?:${[...ALWAYS_DENYLIST, ...SUBTITLE_BLACKLIST].join('|')})\\b`,
  'i',
)

/** Whether the string carries Han-script narrative. */
const HAS_CJK = /\p{Script=Han}/u

/** Collapse the whitespace a stripped token leaves behind: doubled spaces
 * squash to one and a space before sentence punctuation folds into the mark
 * (the · separator keeps both of its spaces). */
function collapse(text: string): string {
  return text.replace(/\s+([，。、；：！？）】」』,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim()
}

/**
 * The body-layer sanitizer (W23-R3 F2): the existing business-term mapping
 * plus the closed protocol-token denylist, so a model narrative that leaks
 * `wfl_approval_todos` in any casing renders without the protocol token.
 * The contextual field name strips only inside a protocol context (see
 * {@link PROTOCOL_BLACKLIST}); the context verdict reads the mapped text, so
 * a mapping that introduces CJK (`pur_orders` → 采购订单) yields the same
 * verdict on every pass and the sanitizer is idempotent over its own output.
 * @param text - the model-authored display string.
 * @returns the people-language rendering with protocol tokens stripped.
 */
export function sanitizeBody(text: string): string {
  const mapped = sanitizeBizText(text)
  const stripped = mapped.replace(ALWAYS_TOKENS, '')
  const contextual = HAS_CJK.test(mapped) || CONTEXT_PROBE.test(mapped)
  return collapse(contextual ? stripped.replace(SUGGESTIONS_TOKEN, '') : stripped)
}

/**
 * The subtitle-layer sanitizer (W23-R3 F2): the body pass plus the
 * subtitle-only tool/protocol names — a one-line subtitle tolerates no
 * unmapped tool token the mapping pass left behind.
 * @param text - the model-authored subtitle string.
 * @returns the people-language subtitle with protocol tokens stripped.
 */
export function sanitizeSubtitle(text: string): string {
  return collapse(sanitizeBody(text).replace(SUBTITLE_TOKENS, ''))
}

/**
 * The payload copy every `ReportCard` render site hands the card (W23-R5):
 * the card renders `title` and `subtitle` straight from the payload, and a
 * stored artifact carries them as the wire wrote them, so the chat report
 * branch, the files preview, and the work-detail result preview all pass
 * this sanitized view — the stored artifact itself keeps its verbatim bytes
 * (the copy path and the durable log never see the sanitized text).
 * @param payload - the stored report artifact.
 * @returns the payload copy with a sanitized title and subtitle; a fully-stripped subtitle renders as absent.
 */
export function sanitizeReportPayload(payload: ReportPayload): ReportPayload {
  return {
    ...payload,
    title: sanitizeBody(payload.title),
    ...(payload.subtitle !== undefined ? { subtitle: sanitizeSubtitle(payload.subtitle) } : {}),
  }
}
