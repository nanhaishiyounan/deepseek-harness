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

/**
 * The protocol token families that strip in every context (W23-R4): no
 * legitimate people-language word can begin with these prefixes, in any
 * casing.
 */
const PREFIX_FAMILIES: readonly string[] = [
  'wfl_[a-z0-9_]+',
  'ask_[a-z_]+',
]

/**
 * The closed protocol-token denylist both display layers share (W23-R3 F2,
 * case-normalized W23-R4): the wfl workflow-table family, the ask_* fence
 * family, and the suggestions field name. `suggestions` doubles as a plain
 * English word, so it strips only inside a protocol context — a CJK
 * narrative, or a string that also carries a stripped token family — and
 * English body prose keeps the word. Extend by appending a family here
 * (word-boundary matched, case-insensitive).
 */
export const PROTOCOL_BLACKLIST: readonly string[] = [...PREFIX_FAMILIES, 'suggestions']

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

/** A word-boundary, case-insensitive matcher over token-family fragments. */
const familyMatcher = (families: readonly string[]): RegExp =>
  new RegExp(`\\b(?:${families.join('|')})\\b`, 'gi')

const ALWAYS_TOKENS = familyMatcher(PREFIX_FAMILIES)
const SUBTITLE_TOKENS = familyMatcher(SUBTITLE_BLACKLIST)
const SUGGESTIONS_TOKEN = familyMatcher(['suggestions'])

/**
 * A protocol context for the `suggestions` field name (W23-R4): a CJK
 * narrative, or a string that also carries any stripped token family. The
 * probe carries no `g` flag — a global regex would carry `lastIndex` across
 * calls and miss earlier tokens.
 */
const CONTEXT_PROBE = new RegExp(
  `\\b(?:${[...PREFIX_FAMILIES, ...SUBTITLE_BLACKLIST].join('|')})\\b`,
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
 * {@link PROTOCOL_BLACKLIST}).
 * @param text - the model-authored display string.
 * @returns the people-language rendering with protocol tokens stripped.
 */
export function sanitizeBody(text: string): string {
  const stripped = sanitizeBizText(text).replace(ALWAYS_TOKENS, '')
  const contextual = HAS_CJK.test(text) || CONTEXT_PROBE.test(text)
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
