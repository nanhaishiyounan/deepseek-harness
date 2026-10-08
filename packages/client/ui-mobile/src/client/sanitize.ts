/**
 * The closed protocol-token denylist shared by the body and subtitle layers
 * (W23-R3 F2): the persona bans these tokens on every card face, but a
 * soft-constraint miss leaked `wfl_approval_todos` into live report-card
 * subtitles, so the render side keeps a closed denylist as the guarantee.
 * Only closed protocol families are stripped here — open-set engineering
 * terms stay a persona concern (the B2 evaluation: a mapping cannot enumerate
 * them and rejection would drop the card).
 */

import { sanitizeBizText } from './messages/rich.ts'

/**
 * The protocol token families both display layers strip (W23-R3 F2): the wfl
 * workflow-table family (`wfl_approval_todos`, …), the ask_* fence family
 * (`ask_field`, `ask_choice`, …), and the suggestions field name. None of
 * these prefixes can begin a legitimate people-language word.
 */
const PROTOCOL_TOKENS = /\b(?:wfl_[A-Za-z0-9_]+|ask_[a-z_]+|suggestions)\b/g

/**
 * The tool and protocol names only the subtitle layer strips (W23-R3 F2): a
 * one-line subtitle has no room for a tool name surviving unmapped, and these
 * closed families cannot appear as legitimate Chinese-subtitle words.
 */
const SUBTITLE_TOKENS = new RegExp(
  '\\b(?:nb_[a-z_]+|kg_[a-z_]+|kb_search|lakehouse_[a-z_]+|connector_[a-z_]+'
  + '|form_draft|form_confirm|reject_flow|submit_receipt|present_card)\\b',
  'g',
)

/** Collapse the whitespace a stripped token leaves behind: doubled spaces
 * squash to one and a space before sentence punctuation folds into the mark
 * (the · separator keeps both of its spaces). */
function collapse(text: string): string {
  return text.replace(/\s+([，。、；：！？）】」』,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim()
}

/**
 * The body-layer sanitizer (W23-R3 F2): the existing business-term mapping
 * plus the closed protocol-token denylist, so a model narrative that leaks
 * `wfl_approval_todos` renders without the protocol token.
 * @param text - the model-authored display string.
 * @returns the people-language rendering with protocol tokens stripped.
 */
export function sanitizeBody(text: string): string {
  return collapse(sanitizeBizText(text).replace(PROTOCOL_TOKENS, ''))
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
