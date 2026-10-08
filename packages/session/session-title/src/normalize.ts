/** Title text normalization and UTF-8-safe truncation. */

/** Operating-system-command escape sequences, including unterminated tails. */
const OSC_SEQUENCE = /(?:\u001B\]|\u009D)(?:(?!\u0007|\u001B\\)[\s\S])*(?:\u0007|\u001B\\|$)/gu
/** Control-sequence-introducer escapes such as SGR color codes. */
const CSI_SEQUENCE = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/gu
/** Remaining two-byte ESC control sequences. */
const ESC_SEQUENCE = /\u001B[@-_]/gu
/** Non-whitespace C0/C1 control characters. */
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu
/** Directional and invisible controls that can make a displayed title deceptive. */
const DIRECTIONAL_CONTROL = /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/gu

/** Reject an invalid public text limit. */
function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
}

/** Remove controls and produce one trimmed, whitespace-normalized line. */
function cleanTitleText(input: string): string {
  return input
    .replace(OSC_SEQUENCE, '')
    .replace(CSI_SEQUENCE, '')
    .replace(ESC_SEQUENCE, '')
    .replace(CONTROL_CHARACTER, '')
    .replace(DIRECTIONAL_CONTROL, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * Truncate a string to a UTF-8 byte budget without splitting a Unicode code point.
 * @param input - normalized title text.
 * @param maxBytes - positive UTF-8 byte budget.
 * @returns the longest leading code-point prefix within the budget.
 */
export function truncateTitleUtf8(input: string, maxBytes: number): string {
  assertPositiveInteger('maxBytes', maxBytes)
  if (Buffer.byteLength(input, 'utf8') <= maxBytes) return input
  let used = 0
  let output = ''
  for (const character of input) {
    const bytes = Buffer.byteLength(character, 'utf8')
    if (used + bytes > maxBytes) break
    output += character
    used += bytes
  }
  return output
}

/**
 * Normalize one accepted session title and enforce its UTF-8 byte budget.
 * @param input - untrusted title text.
 * @param maxBytes - positive maximum encoded size.
 * @returns a terminal-safe one-line title, possibly empty after sanitization.
 */
export function normalizeSessionTitle(input: string, maxBytes: number): string {
  return truncateTitleUtf8(cleanTitleText(input), maxBytes).trimEnd()
}

/** Characters that end one fallback title segment (space or CJK punctuation). */
const SEGMENT_END = /[ \u3002\uFF01\uFF1F\uFF1B\uFF1A\uFF0C\u3001\uFF09\u201D\u2019]/

/**
 * Derive the deterministic first-prompt fallback (W23-B1 word-safe cut): the
 * word cap applies first; when the joined words still exceed the byte cap
 * the title keeps whole segments — every run up to and including a space or
 * CJK punctuation mark — instead of ending mid-word (「…有什么讲」), closing
 * with an ellipsis. A first segment that alone exceeds the budget (one long
 * unbroken token) falls back to the code-point cut, still ellipsized.
 * @param input - text from the first eligible human message.
 * @param maxWords - positive whitespace-delimited word cap.
 * @param maxBytes - positive UTF-8 byte cap. A cap under 4 bytes cannot
 * carry the 3-byte ellipsis and degrades to the plain code-point cut.
 * @returns the normalized leading words within both limits.
 */
export function fallbackSessionTitle(input: string, maxWords: number, maxBytes: number): string {
  assertPositiveInteger('maxWords', maxWords)
  const capped = cleanTitleText(input).split(' ').filter(Boolean).slice(0, maxWords).join(' ')
  if (Buffer.byteLength(capped, 'utf8') <= maxBytes) return capped.trimEnd()
  const budget = maxBytes - 3
  if (budget < 1) return truncateTitleUtf8(capped, maxBytes).trimEnd()
  const segments: string[] = []
  let start = 0
  for (let index = 0; index < capped.length; index++) {
    const character = capped[index]
    if (character !== undefined && SEGMENT_END.test(character)) {
      segments.push(capped.slice(start, index + 1))
      start = index + 1
    }
  }
  if (start < capped.length) segments.push(capped.slice(start))
  let kept = ''
  for (const segment of segments) {
    if (Buffer.byteLength(kept + segment, 'utf8') > budget) break
    kept += segment
  }
  if (kept === '') {
    kept = truncateTitleUtf8(capped, budget)
    // A budget too small for even one whole character keeps the full-cap
    // code-point cut without the ellipsis (it would crowd out the character).
    if (kept === '') return truncateTitleUtf8(capped, maxBytes).trimEnd()
  }
  return kept.trimEnd() + '…'
}
